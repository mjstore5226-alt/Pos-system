import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createAccessGuard } from "./access.js";

test("public hosting refuses missing or short credentials", () => {
  assert.throws(
    () => createAccessGuard({ PUBLIC_DEPLOYMENT: "1" }),
    /at least 16/,
  );
  assert.throws(
    () => createAccessGuard({ PUBLIC_DEPLOYMENT: "1", POS_PASSWORD: "short" }),
    /at least 16/,
  );
  assert.throws(
    () =>
      createAccessGuard({
        POS_PASSWORD: "a-long-synthetic-password",
        POS_USERNAME: "bad:name",
      }),
    /valid POS_USERNAME/,
  );
});
test("hosted pages and data require login, health stays public, local mode stays available", async () => {
  for (const protectedMode of [true, false]) {
    const app = express();
    app.use(
      createAccessGuard(
        protectedMode
          ? {
              PUBLIC_DEPLOYMENT: "1",
              POS_PASSWORD: "synthetic-test-password-only",
            }
          : {},
      ),
    );
    app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
    app.get("/api/products", (_req, res) => res.json({ private: true }));
    app.get("/", (_req, res) => res.send("app"));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      assert.equal((await fetch(base + "/api/health")).status, 200);
      for (const route of ["/", "/api/products"])
        assert.equal(
          (await fetch(base + route)).status,
          protectedMode ? 401 : 200,
        );
      if (protectedMode) {
        const bad = await fetch(base + "/api/products", {
          headers: {
            Authorization:
              "Basic " + Buffer.from("cashier:wrong").toString("base64"),
          },
        });
        assert.equal(bad.status, 401);
        assert.match(bad.headers.get("www-authenticate"), /Basic/);
        const good = await fetch(base + "/api/products", {
          headers: {
            Authorization:
              "Basic " +
              Buffer.from("cashier:synthetic-test-password-only").toString(
                "base64",
              ),
          },
        });
        assert.equal(good.status, 200);
        assert.equal((await good.json()).private, true);
      }
    } finally {
      await new Promise((r) => server.close(r));
    }
  }
});
