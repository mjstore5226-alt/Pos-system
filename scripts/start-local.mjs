import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
if (Number(process.versions.node.split(".")[0]) < 24) {
  console.error(
    "This POS requires Node.js 24 or newer. Install Node.js 24 before starting.",
  );
  process.exit(1);
}
if (
  !existsSync(fileURLToPath(new URL("../dist/index.html", import.meta.url)))
) {
  console.error(
    "The POS has not been built. Run npm ci and npm run build once, or use the prepared offline ZIP.",
  );
  process.exit(1);
}
process.env.NODE_ENV = "production";
process.env.OFFLINE_MODE ??= "1";
try {
  await import("../server/index.js");
} catch {
  console.error(
    "Could not start the POS. Check installed dependencies, data-folder permissions, port and TLS certificate settings.",
  );
  process.exitCode = 1;
}
