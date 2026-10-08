// Product images stay as HTTPS URLs; the server never fetches arbitrary image URLs.
export function safeImageUrl(value) {
  if (!value) return "";
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("Use an HTTPS product image URL (up to 2048 characters).");
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname.includes(".") ||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(
        url.hostname,
      ) ||
      url.hostname.endsWith(".local")
    )
      throw new Error();
    return url.href;
  } catch {
    throw new Error("Use a public HTTPS product image URL.");
  }
}
export function normalizeBarcode(value = "") {
  if (
    typeof value !== "string" ||
    (value && !/^[a-zA-Z0-9._-]{1,64}$/.test(value.trim()))
  )
    throw new Error(
      "Use a barcode with 1–64 letters, numbers, dots, dashes or underscores.",
    );
  return value.trim();
}
export function barcodeKey(value) {
  return /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)
    ? value.padStart(14, "0")
    : value;
}
function imageOrEmpty(value) {
  try {
    return safeImageUrl(value);
  } catch {
    return "";
  }
}

export function createProductLookup({
  fetcher = fetch,
  offlineMode = process.env.OFFLINE_MODE === "1",
  localProducts = () => [],
  googleKey = process.env.SERPAPI_API_KEY,
  foodBase = process.env.OPEN_FOOD_FACTS_BASE_URL ||
    "https://world.openfoodfacts.org",
  googleBase = process.env.GOOGLE_IMAGES_API_URL ||
    "https://serpapi.com/search.json",
} = {}) {
  const cache = new Map();
  async function lookup(barcode) {
    const code = normalizeBarcode(barcode);
    if (!code) throw new Error("Scan or enter a barcode first.");
    const local = localProducts().find(
      (p) => p.barcode && barcodeKey(p.barcode) === barcodeKey(code),
    );
    if (local)
      return {
        barcode: code,
        name: local.name,
        description: local.description,
        imageUrl: local.imageUrl || "",
        imageSource: local.imageSource || "Local inventory",
        imageSourceUrl: local.imageSourceUrl || "",
        message:
          "This barcode is already in your local inventory. Edit the existing product to update it.",
      };
    if (offlineMode)
      return {
        barcode: code,
        name: "",
        description: "",
        imageUrl: "",
        imageSource: "",
        imageSourceUrl: "",
        message:
          "Barcode captured. Internet lookup is disabled in local mode. Enter product details and upload a photo to save on your PC.",
      };
    const saved = cache.get(code);
    if (saved && Date.now() < saved.expires) return saved.value;
    let product = null,
      imageUrl = "",
      imageSource = "",
      imageSourceUrl = "";
    const messages = [];
    const gtin = /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code);
    if (gtin) {
      try {
        const url = new URL(`/api/v2/product/${code}.json`, foodBase);
        url.searchParams.set(
          "fields",
          "code,product_name,brands,image_front_url",
        );
        const response = await fetcher(url, {
          headers: {
            "User-Agent": "GrainCoPOS/1.0 (rice point-of-sale; barcode lookup)",
          },
          signal: AbortSignal.timeout(6500),
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (
          data.status === 1 &&
          data.product &&
          barcodeKey(String(data.product.code || data.code)) ===
            barcodeKey(code)
        )
          product = data.product;
      } catch {
        messages.push(
          "The free product database is unavailable. You can still enter product details.",
        );
      }
    }
    if (googleKey) {
      try {
        const url = new URL(googleBase);
        url.searchParams.set("engine", "google_images");
        url.searchParams.set(
          "q",
          `"${code}" ${product?.product_name || ""} product packaging`,
        );
        url.searchParams.set("safe", "active");
        url.searchParams.set("api_key", googleKey);
        const response = await fetcher(url, {
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (data.error) throw new Error();
        // Never silently substitute a generic image for an unmatched product code.
        const match = data.images_results?.find(
          (item) =>
            imageOrEmpty(item.original) &&
            `${item.title || ""} ${item.link || ""}`.includes(code),
        );
        if (match) {
          imageUrl = imageOrEmpty(match.original);
          imageSource = "Google Images";
          imageSourceUrl = imageOrEmpty(match.link);
        } else
          messages.push(
            "Google did not return an image matching this barcode.",
          );
      } catch {
        messages.push(
          "Google image lookup is unavailable. Check the lookup service configuration or try again.",
        );
      }
    } else
      messages.push(
        "Google Images is not connected. Free product lookup is available.",
      );
    if (!imageUrl && product) {
      imageUrl = imageOrEmpty(product.image_front_url);
      if (imageUrl) {
        imageSource = "Open Food Facts";
        imageSourceUrl = `https://world.openfoodfacts.org/product/${code}`;
      }
    }
    if (!product && !imageUrl)
      messages.push("No product match found. Add the name and photo manually.");
    const value = {
      barcode: code,
      name:
        typeof product?.product_name === "string"
          ? product.product_name.slice(0, 80)
          : "",
      description:
        typeof product?.brands === "string" ? product.brands.slice(0, 120) : "",
      imageUrl,
      imageSource,
      imageSourceUrl,
      message: messages.join(" "),
    };
    // Bound memory and avoid repeating paid searches for successive scans.
    if (imageUrl || product) {
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(code, { value, expires: Date.now() + 5 * 60 * 1000 });
    }
    return value;
  }
  return lookup;
}

export function validateProductImage(value) {
  if (typeof value !== "string" || !value.startsWith("data:"))
    return safeImageUrl(value);
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    value,
  );
  if (!match || value.length > 2800000)
    throw new Error(
      "Use a JPG, PNG or WebP product photo no larger than 2 MB.",
    );
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
  if (!valid || bytes.length > 2 * 1024 * 1024)
    throw new Error("The product photo is invalid or larger than 2 MB.");
  return value;
}
