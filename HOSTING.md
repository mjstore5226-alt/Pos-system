# Publish the POS from GitHub

This POS needs Node.js 24 and a persistent writable disk for SQLite. GitHub Pages cannot run the API or database. The repository stores source code; a hosting service provides the website URL.

## Prepared Render deployment

`render.yaml` defines one Node web service with a 1 GB persistent disk, a health check and a generated login password. It uses Render's paid Starter plan; do not approve provisioning unless you accept the plan's displayed cost. No service has been created by adding this file.

1. Sign in to Render and connect this GitHub repository.
2. Create a Blueprint using branch `coderabbit/enhance-rice-retail-wholesale-pos/548cdb80`. Review the service and disk plan, then deploy.
3. Open the URL shown on the created service dashboard. Render assigns the actual `https://…onrender.com` URL; the name may vary. This guide does not reserve an address.
4. Sign in with username `cashier` and the generated `POS_PASSWORD` from the service's environment settings. Keep that value private. A password of at least 16 characters is required when `PUBLIC_DEPLOYMENT=1`.
5. Confirm products, stock, test checkout and cash-book history before real use. New hosting creates a fresh demo database; it does not automatically copy or synchronize your Windows data.

The login uses the browser's built-in HTTP authentication dialog over the hosting service's HTTPS connection. It is a shared shop login, not separate employee roles. Close the browser session on shared computers. Do not publish an unprotected instance: the server refuses public-mode startup without a password.

## Data and hardware

`DATA_DIR` must stay on persistent storage. Back up the data directory with the service stopped. Use one instance; do not horizontally scale independent SQLite copies. Cloud-hosted sales require internet; the existing Windows runner remains the offline option. Local and hosted databases are separate.

USB devices attach to the browser device, so supported local USB controllers can still be used over HTTPS. A cloud server cannot directly reach your shop's private IP printer/drawer. Keep that hardware on the local runner unless a suitable private network connection is configured. Do not expose the printer directly to the internet.

For another host, use `npm ci --include=dev && npm run build`, then `npm start`, with Node 24, HTTPS, persistent `DATA_DIR`, `PUBLIC_DEPLOYMENT=1`, `POS_USERNAME` and a private `POS_PASSWORD`. Health endpoint `/api/health` is intentionally public; all application pages and APIs require authentication when the password is configured. Ordinary local startup without a password retains the existing trusted-LAN behavior.

## If deployment reports `tsc: command not found` or `vite: not found`

Set the build command to `npm ci --include=dev && npm run build`, then redeploy. Production mode normally skips devDependencies, but TypeScript and Vite are needed during the build. The updated blueprint explicitly includes them. If the service was created manually, update its build command in the hosting dashboard too. Keep the start command as `npm start`.
