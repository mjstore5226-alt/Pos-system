import { createAccessGuard } from "./access.js";
import { execFile } from "node:child_process";
import { createServer as createHttpsServer } from "node:https";
import { networkInterfaces } from "node:os";
import { createProductLookup } from "./product-lookup.js";
import express from "express";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { createStore } from "./store.js";
const accessGuard = createAccessGuard();
const root = fileURLToPath(new URL("..", import.meta.url));
const dataPath = process.env.DATA_DIR || resolve(root, "data");
mkdirSync(dataPath, { recursive: true });
const store = createStore(resolve(dataPath, "pos.sqlite"));
const app = express();
app.use(accessGuard);
app.use(express.json({ limit: "8mb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  // Browser writes must originate from this register, including hardware requests.
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.get("origin") &&
    new URL(req.get("origin")).host !== req.get("host")
  )
    return res
      .status(403)
      .json({ error: "Use this register to submit changes." });
  next();
});
app.get("/api/health", (_req, res) =>
  res.json({
    status: "ok",
    service: "grain-pos",
    offlineMode: process.env.OFFLINE_MODE === "1",
  }),
);
const lookupProduct = createProductLookup({ localProducts: store.products });
app.get("/api/product-lookup/:barcode", async (req, res) =>
  res.json(await lookupProduct(req.params.barcode)),
);
app.get("/api/products", (_req, res) => res.json(store.products()));
app.post("/api/products", (req, res) => res.json(store.saveProduct(req.body)));
app.put("/api/products/:id", (req, res) =>
  res.json(store.saveProduct(req.body, req.params.id)),
);
app.get("/api/settings", (_req, res) => res.json(store.settings()));
app.put("/api/settings", (req, res) => res.json(store.saveSettings(req.body)));
app.get("/api/orders", (_req, res) => res.json(store.orderSummaries()));
app.get("/api/orders/:id", (req, res) => {
  const order = store.orderById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  res.json(order);
});
app.post("/api/orders", (req, res) => res.json(store.checkout(req.body)));
app.get("/api/cash-book", (_req, res) => res.json(store.cashEntries(true)));
app.post("/api/cash-book", (req, res) =>
  res.json(store.saveCashEntry(req.body)),
);
app.get("/api/cash-book/:source/:id", (req, res) => {
  const entry = store
    .cashEntries()
    .find((e) => e.id === req.params.id && e.source === req.params.source);
  if (!entry) return res.status(404).json({ error: "Cash entry not found." });
  res.json(entry);
});
function sendPrinter(buffer) {
  const { printerIp, printerPort } = store.settings();
  if (!printerIp)
    throw new Error("Add your printer IP address in settings first.");
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: printerIp, port: printerPort });
    socket.setTimeout(3000);
    socket.on("connect", () => socket.end(buffer));
    socket.on("timeout", () =>
      socket.destroy(
        new Error("Printer timed out. Check its IP and local network."),
      ),
    );
    socket.on("error", reject);
    socket.on("close", (hadError) => {
      if (!hadError) resolve();
    });
  });
}
app.post("/api/hardware/test", async (_req, res) => {
  await sendPrinter(
    Buffer.from(
      "\x1b@\nGrain & Co. - printer test\nPrinter connection is working.\n\n\n\x1dV\x01",
    ),
  );
  res.json({ ok: true });
});
app.post("/api/hardware/drawer", async (_req, res) => {
  await sendPrinter(Buffer.from([0x1b, 0x70, 0, 25, 250]));
  res.json({ ok: true });
});
app.post("/api/hardware/print/:id", async (req, res) => {
  const order = store.orderById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  const safe = (s) => String(s).replace(/[^\x20-\x7e]/g, "");
  const lines = [
    order.storeName,
    order.number,
    new Date(order.createdAt).toLocaleString(),
    order.customer,
    "--------------------------------",
    ...order.items.flatMap((i) => [
      i.name,
      `${i.quantity} ${i.unit}    ${i.amount.toFixed(2)}`,
    ]),
    "--------------------------------",
    `Subtotal: ${order.subtotal.toFixed(2)}`,
    `Discount: ${order.discount.toFixed(2)}`,
    `Tax: ${order.tax.toFixed(2)}`,
    `TOTAL ${order.currency}: ${order.total.toFixed(2)}`,
    `Payment: ${order.paymentMethod}`,
    ...(order.cardLast4 ? [`Card: **** ${order.cardLast4}`] : []),
    ...(order.reference ? [`Reference: ${order.reference}`] : []),
    ...(order.paymentMethod === "cash"
      ? [
          `Cash: ${order.cashTendered.toFixed(2)}`,
          `Change: ${order.change.toFixed(2)}`,
        ]
      : []),
    "Thank you. See you again!",
  ];
  await sendPrinter(
    Buffer.from("\x1b@" + lines.map(safe).join("\n") + "\n\n\n\x1dV\x01"),
  );
  res.json({ ok: true });
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
app.use((err, _req, res, _next) => {
  console.error(err.message);
  res
    .status(err.status || 400)
    .json({ error: err.message || "Unable to complete the request." });
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve(root, "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true, allowedHosts: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const cert = process.env.TLS_CERT_FILE,
  key = process.env.TLS_KEY_FILE;
if (!!cert !== !!key)
  throw new Error(
    "Set both TLS_CERT_FILE and TLS_KEY_FILE to enable local HTTPS.",
  );
const listener = cert
  ? createHttpsServer({ cert: readFileSync(cert), key: readFileSync(key) }, app)
  : app;
listener.listen(port, host, () => {
  const protocol = cert ? "https" : "http";
  console.log(
    `Grain & Co. ${process.env.OFFLINE_MODE === "1" ? "(local offline mode)" : ""}`,
  );
  const localUrl = `${protocol}://localhost:${port}`;
  console.log(`This PC: ${localUrl}`);
  // Launch only after the server is listening, never during dependency/setup work.
  if (process.platform === "win32" && process.env.OPEN_BROWSER === "1") {
    execFile(
      "rundll32.exe",
      ["url.dll,FileProtocolHandler", localUrl],
      { windowsHide: true },
      (error) => {
        if (error)
          console.error(
            `Could not open the browser automatically. Open ${localUrl} in Chrome or Edge.`,
          );
      },
    );
  }
  if (host === "0.0.0.0")
    for (const address of Object.values(networkInterfaces()).flat())
      if (address?.family === "IPv4" && !address.internal)
        console.log(`Local network: ${protocol}://${address.address}:${port}`);
  console.log("Keep this window open while selling. Press Ctrl+C to stop.");
});
