import test from "node:test";
import assert from "node:assert/strict";
import {
  createProductLookup,
  normalizeBarcode,
  safeImageUrl,
} from "./product-lookup.js";
import { createStore } from "./store.js";
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const code = "3017620422003";
const image = "https://images.openfoodfacts.org/images/products/example.jpg";
const food = {
  status: 1,
  product: {
    code,
    product_name: "Example rice",
    brands: "Example brand",
    image_front_url: image,
  },
};
test("barcode lookup fills food product photo without Google credentials and caches result", async () => {
  let calls = 0;
  const lookup = createProductLookup({
    googleKey: "",
    fetcher: async () => {
      calls++;
      return json(food);
    },
  });
  const found = await lookup(code);
  assert.equal(found.name, "Example rice");
  assert.equal(found.imageUrl, image);
  assert.equal(found.imageSource, "Open Food Facts");
  assert.match(found.message, /not connected/);
  await lookup(code);
  assert.equal(calls, 1);
});
test("Google image matching barcode takes precedence; unrelated search image is skipped", async () => {
  const lookup = createProductLookup({
    googleKey: "synthetic-test-key",
    fetcher: async (url) => {
      if (url.hostname === "world.openfoodfacts.org") return json(food);
      assert.equal(url.searchParams.get("engine"), "google_images");
      assert.match(url.searchParams.get("q"), new RegExp(code));
      return json({
        images_results: [
          {
            title: "Unrelated package",
            original: "https://example.com/wrong.jpg",
            link: "https://example.com/wrong",
          },
          {
            title: `Rice ${code}`,
            original: "https://example.com/right.jpg",
            link: "https://example.com/rice",
          },
        ],
      });
    },
  });
  const found = await lookup(code);
  assert.equal(found.imageUrl, "https://example.com/right.jpg");
  assert.equal(found.imageSource, "Google Images");
});
test("Google service failure uses known barcode photo without leaking provider errors", async () => {
  const lookup = createProductLookup({
    googleKey: "synthetic-test-key",
    fetcher: async (url) =>
      url.hostname === "world.openfoodfacts.org"
        ? json(food)
        : json({ error: "sensitive provider diagnostic" }, 429),
  });
  const found = await lookup(code);
  assert.equal(found.imageUrl, image);
  assert.match(found.message, /unavailable/);
  assert.doesNotMatch(found.message, /sensitive/);
});
test("unknown barcode, provider timeout and mismatched product stay editable with no invented image", async () => {
  for (const fetcher of [
    async () => json({ status: 0 }),
    async () => {
      throw new Error("Timeout");
    },
    async () =>
      json({ ...food, product: { ...food.product, code: "1234567890123" } }),
  ]) {
    const found = await createProductLookup({ googleKey: "", fetcher })(code);
    assert.equal(found.imageUrl, "");
    assert.equal(found.name, "");
    assert.match(found.message, /No product match/);
  }
});
test("invalid and non-HTTPS image URLs are rejected; custom SKU codes skip food lookup", async () => {
  for (const url of [
    "javascript:alert(1)",
    "http://example.com/a.jpg",
    "https://user:password@example.com/a.jpg",
    "https://127.0.0.1/a.jpg",
    "https://192.168.1.5/a.jpg",
  ])
    assert.throws(() => safeImageUrl(url));
  assert.throws(() => normalizeBarcode("https://example.com"));
  const found = await createProductLookup({
    googleKey: "",
    fetcher: () => {
      throw new Error("should not be called");
    },
  })("RICE-25KG");
  assert.equal(found.barcode, "RICE-25KG");
  assert.equal(found.imageUrl, "");
});
test("products persist barcode/image, reject duplicate equivalent GTINs, and allow editing own code", (t) => {
  const s = createStore();
  t.after(() => s.db.close());
  const p = s.products()[0];
  const saved = s.saveProduct(
    {
      ...p,
      barcode: code,
      imageUrl: image,
      imageSource: "Open Food Facts",
      imageSourceUrl: `https://world.openfoodfacts.org/product/${code}`,
    },
    p.id,
  );
  assert.equal(saved.barcode, code);
  assert.equal(saved.imageUrl, image);
  assert.equal(s.products()[0].imageSource, "Open Food Facts");
  assert.throws(
    () => s.saveProduct({ ...s.products()[1], barcode: `0${code}` }, "rice-2"),
    /already assigned/,
  );
  assert.equal(s.saveProduct({ ...saved, stockKg: 20 }, p.id).barcode, code);
  assert.throws(
    () => s.saveProduct({ ...saved, imageUrl: "javascript:alert(1)" }, p.id),
    /HTTPS/,
  );
  assert.equal(
    s.saveProduct(
      {
        ...saved,
        imageUrl: "",
        imageSource: "",
        imageSourceUrl: "",
        barcode: "",
      },
      p.id,
    ).imageUrl,
    "",
  );
});

test("offline mode never contacts external lookup services and finds local barcodes", async () => {
  const local = {
    barcode: code,
    name: "Local rice",
    description: "Stored on PC",
    imageUrl: "",
    imageSource: "",
    imageSourceUrl: "",
  };
  const lookup = createProductLookup({
    offlineMode: true,
    googleKey: "synthetic-key",
    localProducts: () => [local],
    fetcher: () => {
      throw new Error("External request must not run");
    },
  });
  assert.equal((await lookup(code)).name, "Local rice");
  const unknown = await lookup("1234567890123");
  assert.equal(unknown.imageUrl, "");
  assert.match(unknown.message, /disabled in local mode/);
});
test("uploaded product photos persist in SQLite and reject forged images", (t) => {
  const s = createStore();
  t.after(() => s.db.close());
  const p = s.products()[0];
  const image =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rDoAAAAASUVORK5CYII=";
  s.saveProduct({ ...p, imageUrl: image, imageSource: "Local photo" }, p.id);
  assert.equal(s.products()[0].imageUrl, image);
  for (const imageUrl of [
    "data:image/svg+xml;base64,AAAA",
    "data:image/png;base64,SGVsbG8=",
    "data:image/png;base64," + "A".repeat(2800000),
  ])
    assert.throws(() => s.saveProduct({ ...p, imageUrl }, p.id));
  assert.equal(s.products()[0].imageUrl, image);
});
