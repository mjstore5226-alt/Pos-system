import { createHash, timingSafeEqual } from "node:crypto";

// A small shared-login gate for a single shop; local runners remain unchanged.
export function createAccessGuard(env = process.env) {
  const password = env.POS_PASSWORD || "";
  const username = env.POS_USERNAME || "cashier";
  if (env.PUBLIC_DEPLOYMENT === "1" && password.length < 16)
    throw new Error(
      "Public hosting requires POS_PASSWORD with at least 16 characters.",
    );
  if (!password) return (_req, _res, next) => next();
  if (!username || /[:\r\n]/.test(username))
    throw new Error("Choose a valid POS_USERNAME.");
  const digest = (value) => createHash("sha256").update(value).digest();
  const expected = digest(`${username}:${password}`);
  return (req, res, next) => {
    if (req.method === "GET" && req.path === "/api/health") return next();
    const header = req.get("authorization") || "";
    const decoded = /^Basic /i.test(header)
      ? Buffer.from(header.slice(6), "base64").toString("utf8")
      : "";
    if (timingSafeEqual(digest(decoded), expected)) return next();
    res.set("Cache-Control", "no-store");
    res.set("WWW-Authenticate", 'Basic realm="Grain POS", charset="UTF-8"');
    return res.status(401).send("Sign in to your shop POS.");
  };
}
