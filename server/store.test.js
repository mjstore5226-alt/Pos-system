import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createStore } from "./store.js";
const sale = (overrides = {}) => ({
  id: randomUUID(),
  items: [{ productId: "rice-1", unit: "kg", quantity: 2.5 }],
  mode: "retail",
  discount: 0,
  paymentMethod: "cash",
  cashTendered: 500,
  ...overrides,
});
function fresh(t) {
  const s = createStore();
  t.after(() => s.db.close());
  return s;
}
test("mixed kilograms and sacks share stock and produce exact cash change", (t) => {
  const s = fresh(t);
  const o = s.checkout(
    sale({
      items: [
        { productId: "rice-1", unit: "kg", quantity: 2.5 },
        { productId: "rice-1", unit: "sack", quantity: 2 },
      ],
      cashTendered: 4000,
    }),
  );
  assert.equal(o.subtotal, 3045);
  assert.equal(o.change, 955);
  assert.equal(s.products()[0].stockKg, 397.5);
  assert.deepEqual(
    o.items.map((i) => i.kg),
    [2.5, 50],
  );
});
test("wholesale price, fixed discount and tax use integer cents", (t) => {
  const s = fresh(t);
  s.saveSettings({ ...s.settings(), taxRate: 12 });
  const o = s.checkout(sale({ mode: "wholesale", discount: 10 }));
  assert.equal(o.subtotal, 135);
  assert.equal(o.tax, 15);
  assert.equal(o.total, 140);
  assert.equal(o.change, 360);
});
test("client supplied price and total are ignored", (t) => {
  const s = fresh(t);
  const o = s.checkout(
    sale({
      total: 1,
      items: [
        { productId: "rice-1", unit: "kg", quantity: 2.5, amount: 1, price: 1 },
      ],
    }),
  );
  assert.equal(o.total, 145);
});
test("overselling across mixed units is atomic", (t) => {
  const s = fresh(t);
  assert.throws(
    () =>
      s.checkout(
        sale({
          items: [
            { productId: "rice-2", unit: "kg", quantity: 1 },
            { productId: "rice-1", unit: "sack", quantity: 18 },
            { productId: "rice-1", unit: "kg", quantity: 0.001 },
          ],
          cashTendered: 100000,
        }),
      ),
    /Not enough stock/,
  );
  assert.equal(s.products()[0].stockKg, 450);
  assert.equal(s.products()[1].stockKg, 325);
  assert.equal(s.orders().length, 0);
});
test("exact stock depletion allows zero and prevents the next sale", (t) => {
  const s = fresh(t);
  s.checkout(
    sale({
      items: [{ productId: "rice-1", unit: "sack", quantity: 18 }],
      cashTendered: 30000,
    }),
  );
  assert.equal(s.products()[0].stockKg, 0);
  assert.throws(() => s.checkout(sale()), /Not enough stock/);
});
test("invalid weights, partial sacks, negative discounts and insufficient cash are rejected", (t) => {
  const s = fresh(t);
  for (const quantity of [0, -1, NaN, Infinity, 0.0001])
    assert.throws(() =>
      s.checkout(
        sale({ items: [{ productId: "rice-1", unit: "kg", quantity }] }),
      ),
    );
  assert.throws(
    () =>
      s.checkout(
        sale({ items: [{ productId: "rice-1", unit: "sack", quantity: 1.5 }] }),
      ),
    /whole sacks/,
  );
  for (const discount of [-1, 146, NaN])
    assert.throws(() => s.checkout(sale({ discount })), /Discount/);
  assert.throws(
    () => s.checkout(sale({ cashTendered: 144.99 })),
    /Cash received/,
  );
  assert.equal(s.orders().length, 0);
});
test("retries of the same transaction do not decrement stock twice", (t) => {
  const s = fresh(t),
    input = sale();
  const first = s.checkout(input);
  const retry = s.checkout(input);
  assert.deepEqual(first, retry);
  assert.equal(s.products()[0].stockKg, 447.5);
  assert.equal(s.orders().length, 1);
});
test("debit saves only exactly four digits and requires terminal confirmation", (t) => {
  const s = fresh(t);
  for (const cardLast4 of ["", "123", "12345", "abcd"])
    assert.throws(
      () =>
        s.checkout(
          sale({ paymentMethod: "debit", cardLast4, paymentConfirmed: true }),
        ),
      /last 4/,
    );
  assert.throws(
    () => s.checkout(sale({ paymentMethod: "debit", cardLast4: "0123" })),
    /terminal/,
  );
  const o = s.checkout(
    sale({ paymentMethod: "debit", cardLast4: "0123", paymentConfirmed: true }),
  );
  assert.equal(o.cardLast4, "0123");
  assert.equal(o.cashTendered, null);
  assert.equal(o.change, 0);
});
test("e-wallet requires receipt or reference plus independent confirmation", (t) => {
  const s = fresh(t);
  assert.throws(
    () =>
      s.checkout(sale({ paymentMethod: "ewallet", paymentConfirmed: true })),
    /receipt/,
  );
  assert.throws(
    () => s.checkout(sale({ paymentMethod: "ewallet", reference: "REF-001" })),
    /Confirm/,
  );
  const o = s.checkout(
    sale({
      paymentMethod: "ewallet",
      reference: " SCAN-001 ",
      paymentConfirmed: true,
    }),
  );
  assert.equal(o.reference, "SCAN-001");
});
test("receipt images are validated and retained with the order", (t) => {
  const s = fresh(t);
  const receipt =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rDoAAAAASUVORK5CYII=";
  const o = s.checkout(
    sale({ paymentMethod: "ewallet", receipt, paymentConfirmed: true }),
  );
  assert.equal(o.receipt, receipt);
  assert.throws(
    () =>
      s.checkout(
        sale({
          paymentMethod: "ewallet",
          receipt: "data:image/png;base64,SGVsbG8=",
          paymentConfirmed: true,
        }),
      ),
    /valid image/,
  );
  assert.throws(
    () =>
      s.checkout(
        sale({
          paymentMethod: "ewallet",
          receipt: "data:image/svg+xml;base64,AAAA",
          paymentConfirmed: true,
        }),
      ),
    /JPEG/,
  );
});
test("gram precision and fractional prices round consistently", (t) => {
  const s = fresh(t);
  s.saveProduct({ ...s.products()[0], retailPrice: 58.57 }, "rice-1");
  const o = s.checkout(
    sale({ items: [{ productId: "rice-1", unit: "kg", quantity: 1.234 }] }),
  );
  assert.equal(o.total, 72.28);
  assert.equal(s.products()[0].stockKg, 448.766);
});
test("product edits, settings and receipts survive database reopen", () => {
  const dir = mkdtempSync(join(tmpdir(), "grain-test-"));
  let s;
  try {
    const path = join(dir, "test.sqlite");
    s = createStore(path);
    s.saveSettings({
      ...s.settings(),
      storeName: "Test Rice",
      currency: "USD",
    });
    s.saveProduct({ ...s.products()[0], stockKg: 100 }, "rice-1");
    const o = s.checkout(sale());
    s.db.close();
    s = null;
    s = createStore(path);
    assert.equal(s.settings().storeName, "Test Rice");
    assert.equal(s.products()[0].stockKg, 97.5);
    assert.equal(s.orders()[0].id, o.id);
    assert.equal(s.orders()[0].currency, "USD");
  } finally {
    s?.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("printer settings only accept private IPv4 and known printer ports", (t) => {
  const s = fresh(t);
  for (const printerIp of [
    "127.0.0.1",
    "169.254.169.254",
    "8.8.8.8",
    "example.com",
    "192.168.1.999",
  ])
    assert.throws(() => s.saveSettings({ ...s.settings(), printerIp }), /IPv4/);
  assert.throws(
    () =>
      s.saveSettings({
        ...s.settings(),
        printerIp: "192.168.1.10",
        printerPort: 80,
      }),
    /port/,
  );
  assert.equal(
    s.saveSettings({ ...s.settings(), printerIp: "192.168.1.10" }).printerIp,
    "192.168.1.10",
  );
});
test("retry identifiers cannot be reused for a different transaction", (t) => {
  const s = fresh(t),
    input = sale();
  s.checkout(input);
  assert.throws(
    () =>
      s.checkout({
        ...input,
        items: [{ productId: "rice-2", unit: "kg", quantity: 1 }],
      }),
    /different details/,
  );
  assert.equal(s.orders().length, 1);
  assert.equal(s.products()[0].stockKg, 447.5);
});
test("a stale displayed total or currency cannot silently change the recorded payment", (t) => {
  const s = fresh(t);
  assert.throws(
    () => s.checkout(sale({ expectedTotal: 140, expectedCurrency: "PHP" })),
    /changed/,
  );
  assert.throws(
    () => s.checkout(sale({ expectedTotal: 145, expectedCurrency: "USD" })),
    /changed/,
  );
  assert.equal(
    s.checkout(sale({ expectedTotal: 145, expectedCurrency: "PHP" })).total,
    145,
  );
});

const proofImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rDoAAAAASUVORK5CYII=";
test("cash book includes cash sales after change exactly once and excludes electronic tenders", (t) => {
  const s = fresh(t);
  const input = sale({ receipt: proofImage });
  s.checkout(input);
  s.checkout(input);
  s.checkout(
    sale({
      paymentMethod: "debit",
      cardLast4: "0123",
      paymentConfirmed: true,
      receipt: proofImage,
    }),
  );
  s.checkout(
    sale({
      paymentMethod: "ewallet",
      reference: "ref",
      paymentConfirmed: true,
    }),
  );
  const entries = s.cashEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].amount, 145);
  assert.equal(entries[0].receipt, proofImage);
  assert.equal(
    s.orders().find((o) => o.paymentMethod === "debit").receipt,
    proofImage,
  );
});
test("cash entries persist proofs, reject changed retries and retain recorded currency", () => {
  const dir = mkdtempSync(join(tmpdir(), "grain-cash-"));
  let s = createStore(join(dir, "pos.sqlite"));
  try {
    const input = {
      id: randomUUID(),
      direction: "in",
      amount: 1000.25,
      currency: "PHP",
      note: "Opening float",
      receipt: proofImage,
    };
    s.saveCashEntry(input);
    s.saveCashEntry(input);
    s.saveCashEntry({
      ...input,
      id: randomUUID(),
      direction: "out",
      amount: 25.1,
      note: "Supplier",
    });
    assert.throws(
      () => s.saveCashEntry({ ...input, amount: 99 }),
      /different details/,
    );
    s.saveSettings({ ...s.settings(), currency: "USD" });
    assert.equal(s.saveCashEntry(input).currency, "PHP");
    assert.throws(
      () => s.saveCashEntry({ ...input, id: randomUUID() }),
      /Currency changed/,
    );
    s.db.close();
    s = createStore(join(dir, "pos.sqlite"));
    assert.equal(s.cashEntries().length, 2);
    assert.equal(s.cashEntries()[0].receipt, proofImage);
    assert.equal(
      s
        .cashEntries()
        .reduce(
          (n, e) =>
            n + (e.direction === "in" ? 1 : -1) * Math.round(e.amount * 100),
          0,
        ),
      97515,
    );
  } finally {
    s.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("invalid cash movements and forged proofs never affect the cash book or stock", (t) => {
  const s = fresh(t);
  const input = {
    id: randomUUID(),
    direction: "out",
    amount: 12,
    currency: "PHP",
    note: "Expense",
  };
  for (const bad of [
    { amount: -1 },
    { amount: 0 },
    { amount: 0.001 },
    { amount: Infinity },
    { amount: "12" },
    { direction: "sale" },
    { note: " " },
    { receipt: "data:image/png;base64,YWJj" },
  ])
    assert.throws(() => s.saveCashEntry({ ...input, ...bad }));
  assert.throws(
    () => s.checkout(sale({ receipt: "data:image/png;base64,YWJj" })),
    /valid image/,
  );
  assert.equal(s.cashEntries().length, 0);
  assert.equal(s.products()[0].stockKg, 450);
});

test("wallet movements, reference and proof survive restart with separate accounts", () => {
  const dir = mkdtempSync(join(tmpdir(), "grain-wallet-"));
  let s = createStore(join(dir, "pos.sqlite"));
  try {
    const common = {
      direction: "in",
      amount: 200,
      currency: "PHP",
      note: "Wallet funding",
      receipt: proofImage,
      reference: "QR-REF-001",
    };
    for (const account of ["cash", "gcash", "maya", "other"]) {
      const input = {
        ...common,
        id: randomUUID(),
        account,
        walletName: account === "other" ? " ShopeePay " : "",
      };
      s.saveCashEntry(input);
      s.saveCashEntry(input);
      assert.throws(
        () => s.saveCashEntry({ ...input, reference: "DIFFERENT" }),
        /different details/,
      );
      assert.throws(
        () =>
          s.saveCashEntry({
            ...input,
            account: account === "cash" ? "gcash" : "cash",
          }),
        /different details/,
      );
    }
    s.saveCashEntry({
      ...common,
      id: randomUUID(),
      account: "gcash",
      direction: "out",
      amount: 30,
    });
    s.db.close();
    s = createStore(join(dir, "pos.sqlite"));
    const entries = s.cashEntries();
    assert.equal(entries.length, 5);
    for (const e of entries) {
      assert.equal(e.reference, "QR-REF-001");
      assert.equal(e.receipt, proofImage);
    }
    assert.equal(
      entries.find((e) => e.account === "other").walletName,
      "SHOPEEPAY",
    );
    assert.equal(
      entries
        .filter((e) => e.account === "gcash")
        .reduce((n, e) => n + (e.direction === "in" ? 1 : -1) * e.amount, 0),
      170,
    );
    assert.equal(entries.filter((e) => e.account === "cash").length, 1);
  } finally {
    s.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("legacy cash history and retries remain compatible, invalid wallets/references are rejected", (t) => {
  const s = fresh(t);
  const input = {
    id: randomUUID(),
    direction: "in",
    amount: 100,
    currency: "PHP",
    note: "Legacy float",
    receipt: null,
  };
  const legacy = s.saveCashEntry(input);
  delete legacy.account;
  delete legacy.walletName;
  delete legacy.reference;
  s.db
    .prepare("UPDATE cash_entries SET data=? WHERE id=?")
    .run(JSON.stringify(legacy), legacy.id);
  assert.equal(s.cashEntries()[0].account, "cash");
  assert.equal(
    s.saveCashEntry({ ...input, account: "cash", reference: "" }).id,
    legacy.id,
  );
  for (const bad of [
    { account: "bank" },
    { account: "other", walletName: " " },
    { account: "other", walletName: "gcash" },
    { reference: 123 },
    { reference: "a".repeat(251) },
  ])
    assert.throws(() =>
      s.saveCashEntry({ ...input, id: randomUUID(), ...bad }),
    );
  assert.equal(s.cashEntries().length, 1);
});

test("history summaries exclude proofs but indexed details retain them", (t) => {
  const s = fresh(t);
  const o = s.checkout(sale({ receipt: proofImage }));
  const cash = s.saveCashEntry({
    id: randomUUID(),
    direction: "in",
    amount: 10,
    note: "Summary check",
    currency: "PHP",
    receipt: proofImage,
  });
  const orders = s.orderSummaries();
  assert.equal(orders.length, 1);
  assert.equal(orders[0].hasReceipt, true);
  assert.ok(!("receipt" in orders[0]));
  assert.ok(!("fingerprint" in orders[0]));
  assert.equal(s.orderById(o.id).receipt, proofImage);
  assert.equal(s.orderById("missing"), null);
  const entries = s.cashEntries(true);
  assert.equal(entries.length, 2);
  assert.ok(
    entries.every(
      (e) => e.hasReceipt && !("receipt" in e) && !("fingerprint" in e),
    ),
  );
  assert.equal(
    s.cashEntries().find((e) => e.id === cash.id).receipt,
    proofImage,
  );
});

test("scanned references and photos are retained for every payment method", (t) => {
  const s = fresh(t);
  for (const paymentMethod of ["cash", "debit", "ewallet"]) {
    const reference = `ANDROID-${paymentMethod}-123`;
    const input = sale({
      paymentMethod,
      reference,
      receipt: proofImage,
      cardLast4: "1234",
      paymentConfirmed: true,
    });
    const order = s.checkout(input);
    assert.equal(s.orderById(order.id).reference, reference);
    assert.equal(s.orderById(order.id).receipt, proofImage);
    assert.equal(s.checkout(input).id, order.id);
    if (paymentMethod === "cash")
      assert.equal(
        s.cashEntries(true).find((e) => e.id === order.id).reference,
        reference,
      );
    assert.throws(
      () =>
        s.checkout(
          sale({
            paymentMethod,
            reference: "x".repeat(251),
            cardLast4: "1234",
            paymentConfirmed: true,
          }),
        ),
      /reference/,
    );
  }
});
