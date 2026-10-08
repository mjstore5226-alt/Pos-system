import {
  normalizeBarcode,
  barcodeKey,
  safeImageUrl,
  validateProductImage,
} from "./product-lookup.js";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";

function validateReceipt(value) {
  const input = { receipt: value };
  let receipt = null;
  if (input.receipt) {
    if (typeof input.receipt !== "string")
      throw new Error("Use an image for payment proof.");
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
      input.receipt,
    );
    if (!match || input.receipt.length > 7000000)
      throw new Error("Use a JPEG, PNG, or WebP receipt under 5 MB.");
    const bytes = Buffer.from(match[2], "base64");
    const valid =
      match[1] === "jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : match[1] === "png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP";
    if (bytes.length > 5 * 1024 * 1024)
      throw new Error("Use a receipt under 5 MB.");
    if (!valid) throw new Error("The receipt is not a valid image.");
    receipt = input.receipt;
  }
  return receipt;
}

export const defaults = {
  storeName: "Grain & Co.",
  subtitle: "Your neighborhood rice store",
  currency: "PHP",
  taxRate: 0,
  printerIp: "",
  printerPort: 9100,
  drawerMode: "manual",
  autoDrawer: false,
};
const seeds = [
  [
    "Jasmine Rice",
    "Fragrant & fluffy",
    "Premium",
    58,
    54,
    25,
    450,
    "#57806b",
    "JASMINE",
    "Thai Hom Mali",
    true,
  ],
  [
    "Dinorado Rice",
    "Soft & aromatic",
    "Premium",
    62,
    57,
    25,
    325,
    "#b58b5d",
    "DINORADO",
    "Premium quality",
    true,
  ],
  [
    "Sinandomeng Rice",
    "An everyday favorite",
    "Regular",
    48,
    44,
    50,
    780,
    "#77999c",
    "SINANDOMENG",
    "Everyday goodness",
    false,
  ],
  [
    "Brown Rice",
    "Wholesome & nutritious",
    "Specialty",
    75,
    70,
    25,
    180,
    "#a58068",
    "BROWN RICE",
    "Naturally nutritious",
    false,
  ],
  [
    "Glutinous Rice",
    "Perfectly soft & sticky",
    "Specialty",
    68,
    63,
    25,
    225,
    "#999175",
    "GLUTINOUS",
    "Sweet & sticky",
    false,
  ],
  [
    "Well-Milled Rice",
    "Good quality, great value",
    "Regular",
    44,
    40,
    50,
    600,
    "#84966a",
    "WELL-MILLED",
    "A family favorite",
    false,
  ],
];
export function createStore(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS cash_entries(id TEXT PRIMARY KEY, data TEXT NOT NULL)",
  );
  if (!db.prepare("SELECT id FROM settings").get()) {
    db.prepare("INSERT INTO settings VALUES(1, ?)").run(
      JSON.stringify(defaults),
    );
    for (const [i, s] of seeds.entries()) {
      const [
        name,
        description,
        category,
        retailPrice,
        wholesalePrice,
        sackKg,
        stockKg,
        color,
        label,
        tagline,
        popular,
      ] = s;
      const product = {
        id: `rice-${i + 1}`,
        name,
        description,
        category,
        retailPrice,
        wholesalePrice,
        sackKg,
        stockKg,
        color,
        label,
        tagline,
        popular,
      };
      db.prepare("INSERT INTO products VALUES(?, ?)").run(
        product.id,
        JSON.stringify(product),
      );
    }
  }
  const products = () =>
    db
      .prepare("SELECT data FROM products")
      .all()
      .map((r) => JSON.parse(r.data));
  const settings = () =>
    JSON.parse(db.prepare("SELECT data FROM settings WHERE id=1").get().data);
  const orders = () =>
    db
      .prepare("SELECT data FROM orders ORDER BY rowid DESC")
      .all()
      .map((r) => JSON.parse(r.data));
  function summaries(table) {
    return db
      .prepare(
        `SELECT json_remove(data, '$.receipt', '$.fingerprint') AS data, CASE WHEN json_extract(data, '$.receipt') IS NOT NULL AND json_extract(data, '$.receipt') != '' THEN 1 ELSE 0 END AS hasReceipt FROM ${table} ORDER BY rowid DESC`,
      )
      .all()
      .map((r) => ({ ...JSON.parse(r.data), hasReceipt: !!r.hasReceipt }));
  }
  const orderSummaries = () => summaries("orders");
  const orderById = (id) => {
    const row = db.prepare("SELECT data FROM orders WHERE id=?").get(id);
    return row ? JSON.parse(row.data) : null;
  };
  const cents = (value) => Math.round(value * 100);
  function saveProduct(input, id) {
    const old = id ? products().find((p) => p.id === id) : null;
    if (id && !old) throw new Error("Product not found.");
    if (
      typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.length > 80
    )
      throw new Error("Enter a product name (up to 80 characters).");
    if (!["Premium", "Regular", "Specialty"].includes(input.category))
      throw new Error("Choose a valid category.");
    for (const key of ["retailPrice", "wholesalePrice", "sackKg", "stockKg"]) {
      if (
        typeof input[key] !== "number" ||
        !Number.isFinite(input[key]) ||
        input[key] < 0 ||
        input[key] > 1000000 ||
        (key !== "stockKg" && input[key] === 0)
      )
        throw new Error(`Enter a valid ${key}.`);
    }
    const barcode = normalizeBarcode(input.barcode ?? old?.barcode ?? "");
    if (
      barcode &&
      products().some(
        (p) =>
          p.id !== id &&
          p.barcode &&
          barcodeKey(p.barcode) === barcodeKey(barcode),
      )
    )
      throw new Error(
        "This barcode is already assigned to another product. Edit that product instead.",
      );
    const imageUrl = validateProductImage(
      input.imageUrl ?? old?.imageUrl ?? "",
    );
    const p = {
      ...old,
      barcode,
      imageUrl,
      imageSource: String(input.imageSource ?? old?.imageSource ?? "").slice(
        0,
        80,
      ),
      imageSourceUrl: safeImageUrl(
        input.imageSourceUrl ?? old?.imageSourceUrl ?? "",
      ),
      id: id || randomUUID(),
      name: input.name.trim(),
      category: input.category,
      description: String(input.description || "").slice(0, 120),
      retailPrice: cents(input.retailPrice) / 100,
      wholesalePrice: cents(input.wholesalePrice) / 100,
      sackKg: Math.round(input.sackKg * 1000) / 1000,
      stockKg: Math.round(input.stockKg * 1000) / 1000,
      color: old?.color || "#57806b",
      label: input.name.trim().toUpperCase(),
      tagline: old?.tagline || "Selected quality rice",
      popular: old?.popular || false,
    };
    if (p.sackKg <= 0 || p.retailPrice <= 0 || p.wholesalePrice <= 0)
      throw new Error("Prices and sack size must be greater than zero.");
    db.prepare(
      "INSERT INTO products VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    ).run(p.id, JSON.stringify(p));
    return p;
  }
  function saveSettings(input) {
    if (
      typeof input.storeName !== "string" ||
      !input.storeName.trim() ||
      input.storeName.length > 80
    )
      throw new Error("Enter a store name (up to 80 characters).");
    if (!["PHP", "USD", "MYR", "INR", "IDR", "SGD"].includes(input.currency))
      throw new Error("Unsupported currency.");
    if (
      typeof input.taxRate !== "number" ||
      !Number.isFinite(input.taxRate) ||
      input.taxRate < 0 ||
      input.taxRate > 100
    )
      throw new Error("Tax must be between 0 and 100%.");
    const ip = input.printerIp || "";
    // Restrict the network device endpoint to private IPv4 printer addresses.
    const parts = String(ip).split(".").map(Number);
    if (
      ip &&
      (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ||
        parts.some((x) => x > 255) ||
        !(
          parts[0] === 10 ||
          (parts[0] === 192 && parts[1] === 168) ||
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        ))
    )
      throw new Error(
        "Use a local printer IPv4 address, such as 192.168.1.100.",
      );
    if (![9100, 9101].includes(input.printerPort))
      throw new Error("Printer port must be 9100 or 9101.");
    if (!["manual", "usb", "printer"].includes(input.drawerMode))
      throw new Error("Select a drawer connection.");
    const next = {
      storeName: input.storeName.trim(),
      subtitle: String(input.subtitle || "").slice(0, 120),
      currency: input.currency,
      taxRate: input.taxRate,
      printerIp: ip,
      printerPort: input.printerPort,
      drawerMode: input.drawerMode,
      autoDrawer: input.drawerMode !== "manual" && !!input.autoDrawer,
    };
    db.prepare("UPDATE settings SET data=? WHERE id=1").run(
      JSON.stringify(next),
    );
    return next;
  }
  function saveCashEntry(input) {
    if (typeof input.id !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(input.id))
      throw new Error("Invalid entry identifier.");
    if (!["in", "out"].includes(input.direction))
      throw new Error("Choose cash in or cash out.");
    if (
      typeof input.amount !== "number" ||
      !Number.isFinite(input.amount) ||
      input.amount <= 0 ||
      input.amount > 100000000 ||
      Math.abs(input.amount * 100 - cents(input.amount)) > 0.00001
    )
      throw new Error(
        "Enter a positive amount with at most two decimal places.",
      );
    if (
      typeof input.note !== "string" ||
      !input.note.trim() ||
      input.note.length > 250
    )
      throw new Error("Enter a reason (up to 250 characters).");
    const account = input.account ?? "cash";
    if (!["cash", "gcash", "maya", "other"].includes(account))
      throw new Error("Choose a valid cash or e-wallet account.");
    const walletName =
      account === "other" && typeof input.walletName === "string"
        ? input.walletName.trim().toUpperCase()
        : "";
    if (
      account === "other" &&
      (!walletName ||
        walletName.length > 60 ||
        ["CASH", "GCASH", "MAYA"].includes(walletName))
    )
      throw new Error(
        "Enter another e-wallet name (up to 60 characters), or select Cash, GCash or Maya.",
      );
    if (
      input.reference != null &&
      (typeof input.reference !== "string" || input.reference.length > 250)
    )
      throw new Error("Payment reference must be up to 250 characters.");
    const reference = (input.reference || "").trim();
    const receipt = validateReceipt(input.receipt);
    const details = {
      direction: input.direction,
      amount: cents(input.amount) / 100,
      note: input.note.trim(),
      currency: input.currency,
      receipt,
      // Keep legacy cash/no-reference fingerprints valid for interrupted retries.
      ...(account !== "cash" ? { account, walletName } : {}),
      ...(reference ? { reference } : {}),
    };
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(details))
      .digest("hex");
    const existing = db
      .prepare("SELECT data FROM cash_entries WHERE id=?")
      .get(input.id);
    if (existing) {
      const entry = JSON.parse(existing.data);
      if (entry.fingerprint !== fingerprint)
        throw new Error(
          "This entry was already saved with different details. Refresh the cash book.",
        );
      return entry;
    }
    if (input.currency !== settings().currency)
      throw new Error("Currency changed. Refresh before recording cash.");
    const entry = {
      ...details,
      id: input.id,
      createdAt: new Date().toISOString(),
      fingerprint,
      source: "manual",
      account,
      walletName,
      reference,
    };
    db.prepare("INSERT INTO cash_entries VALUES(?, ?)").run(
      entry.id,
      JSON.stringify(entry),
    );
    return entry;
  }
  function cashEntries(summary = false) {
    const manual = summary
      ? summaries("cash_entries")
      : db
          .prepare("SELECT data FROM cash_entries ORDER BY rowid DESC")
          .all()
          .map((r) => JSON.parse(r.data));
    const sales = (summary ? orderSummaries() : orders())
      .filter((o) => o.paymentMethod === "cash")
      .map((o) => ({
        id: o.id,
        source: "sale",
        direction: "in",
        amount: o.total,
        currency: o.currency,
        note: `Cash sale ${o.number}`,
        reference: o.reference || "",
        createdAt: o.createdAt,
        ...(summary ? { hasReceipt: o.hasReceipt } : { receipt: o.receipt }),
      }));
    return [...manual, ...sales]
      .map((e) => ({
        ...e,
        account: e.account || "cash",
        walletName: e.walletName || "",
        reference: e.reference || "",
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  function checkout(input) {
    if (typeof input.id !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(input.id))
      throw new Error("Invalid transaction identifier.");
    const existing = db
      .prepare("SELECT data FROM orders WHERE id=?")
      .get(input.id);
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          items: input.items,
          mode: input.mode,
          customer: input.customer,
          discount: input.discount,
          paymentMethod: input.paymentMethod,
          cashTendered: input.cashTendered,
          cardLast4: input.cardLast4,
          reference: input.reference,
          receipt: input.receipt,
          paymentConfirmed: input.paymentConfirmed,
          expectedTotal: input.expectedTotal,
          expectedCurrency: input.expectedCurrency,
        }),
      )
      .digest("hex");
    if (existing) {
      const saved = JSON.parse(existing.data);
      if (saved.fingerprint && saved.fingerprint !== fingerprint)
        throw new Error(
          "This transaction was already saved with different details. Check Sales history and start a new order.",
        );
      return saved;
    }
    if (!["retail", "wholesale"].includes(input.mode))
      throw new Error("Choose retail or wholesale.");
    if (!["cash", "debit", "ewallet"].includes(input.paymentMethod))
      throw new Error("Choose a payment method.");
    if (
      !Array.isArray(input.items) ||
      !input.items.length ||
      input.items.length > 100
    )
      throw new Error("Add items to the order.");
    if (
      input.paymentMethod === "debit" &&
      (typeof input.cardLast4 !== "string" || !/^\d{4}$/.test(input.cardLast4))
    )
      throw new Error("Enter the last 4 digits of the debit card.");
    if (
      input.paymentMethod === "ewallet" &&
      !String(input.reference || "").trim() &&
      !input.receipt
    )
      throw new Error("Capture a payment receipt or enter its reference.");
    if (input.paymentMethod === "ewallet" && !input.paymentConfirmed)
      throw new Error("Confirm the e-wallet payment was received.");
    if (input.paymentMethod === "debit" && !input.paymentConfirmed)
      throw new Error("Confirm approval on your card terminal.");
    const config = settings();
    const all = products();
    const needed = new Map();
    const items = input.items.map((item) => {
      const p = all.find((p) => p.id === item.productId);
      if (!p) throw new Error("A product is no longer available.");
      if (
        !["kg", "sack"].includes(item.unit) ||
        typeof item.quantity !== "number" ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > 100000 ||
        Math.abs(item.quantity * 1000 - Math.round(item.quantity * 1000)) >
          0.00001 ||
        (item.unit === "sack" && !Number.isInteger(item.quantity))
      )
        throw new Error(
          "Use positive quantities: whole sacks or kilograms to 3 decimal places.",
        );
      const grams = Math.round(
        item.quantity * (item.unit === "sack" ? p.sackKg : 1) * 1000,
      );
      if (grams <= 0) throw new Error("Minimum weight is 0.001 kg.");
      needed.set(p.id, (needed.get(p.id) || 0) + grams);
      const price = cents(
        input.mode === "retail" ? p.retailPrice : p.wholesalePrice,
      );
      return {
        productId: p.id,
        name: p.name,
        unit: item.unit,
        quantity: item.quantity,
        sackKg: p.sackKg,
        kg: grams / 1000,
        pricePerKg: price / 100,
        amount: Math.round((price * grams) / 1000) / 100,
      };
    });
    for (const [id, grams] of needed)
      if (grams > Math.round(all.find((p) => p.id === id).stockKg * 1000))
        throw new Error(
          `Not enough stock for ${all.find((p) => p.id === id).name}.`,
        );
    const subtotal = items.reduce((s, i) => s + cents(i.amount), 0);
    if (
      typeof input.discount !== "number" ||
      !Number.isFinite(input.discount) ||
      input.discount < 0 ||
      cents(input.discount) > subtotal
    )
      throw new Error("Discount must be between zero and the subtotal.");
    const discount = cents(input.discount);
    const tax = Math.round(((subtotal - discount) * config.taxRate) / 100);
    const total = subtotal - discount + tax;
    if (
      (input.expectedTotal !== undefined &&
        (typeof input.expectedTotal !== "number" ||
          cents(input.expectedTotal) !== total)) ||
      (input.expectedCurrency !== undefined &&
        input.expectedCurrency !== config.currency)
    )
      throw new Error(
        "Prices, tax, or currency changed. Reload the register and review the order before collecting payment.",
      );
    if (
      input.paymentMethod === "cash" &&
      (typeof input.cashTendered !== "number" ||
        !Number.isFinite(input.cashTendered) ||
        cents(input.cashTendered) < total ||
        input.cashTendered > 100000000)
    )
      throw new Error("Cash received must cover the total.");
    if (
      input.reference != null &&
      (typeof input.reference !== "string" || input.reference.length > 250)
    )
      throw new Error("Payment reference must be up to 250 characters.");
    const receipt = validateReceipt(input.receipt);
    const order = {
      id: input.id,
      fingerprint,
      number: `GC-${String(db.prepare("SELECT count(*) as n FROM orders").get().n + 1).padStart(4, "0")}`,
      createdAt: new Date().toISOString(),
      mode: input.mode,
      customer: String(input.customer || "Walk-in customer").slice(0, 100),
      items,
      subtotal: subtotal / 100,
      discount: discount / 100,
      tax: tax / 100,
      total: total / 100,
      currency: config.currency,
      storeName: config.storeName,
      paymentMethod: input.paymentMethod,
      cardLast4: input.paymentMethod === "debit" ? input.cardLast4 : null,
      reference: String(input.reference || "").trim() || null,
      receipt,
      cashTendered:
        input.paymentMethod === "cash" ? cents(input.cashTendered) / 100 : null,
      change:
        input.paymentMethod === "cash"
          ? (cents(input.cashTendered) - total) / 100
          : 0,
    };
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const [id, grams] of needed) {
        const p = all.find((p) => p.id === id);
        p.stockKg = (Math.round(p.stockKg * 1000) - grams) / 1000;
        db.prepare("UPDATE products SET data=? WHERE id=?").run(
          JSON.stringify(p),
          id,
        );
      }
      db.prepare("INSERT INTO orders VALUES(?, ?)").run(
        order.id,
        JSON.stringify(order),
      );
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return order;
  }
  return {
    db,
    products,
    settings,
    orders,
    orderSummaries,
    orderById,
    saveProduct,
    saveSettings,
    checkout,
    saveCashEntry,
    cashEntries,
  };
}
