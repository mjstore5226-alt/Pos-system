# Grain & Co. — Rice POS

A local, single-register POS for rice retail and wholesale, built with React, TypeScript, Express, and SQLite.

## Run

Requires Node.js 24 (uses built-in `node:sqlite`) and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. For production assets: `npm run build`, then `npm start`. Set `PORT` to change the port. The app serves both UI and API from the same process. No external API or paid service is needed. Fonts and barcode-decoder assets are bundled locally. `npm start` uses local offline mode by default, with internet product lookup disabled. See [the local PC/LAN guide](LOCAL-SETUP.md) for the one-click Windows runner and prepared ZIP.

```sh
npm test       # checkout, stock, validation, and persistence tests
npm run build # TypeScript and production build
```

## Included

- Retail and wholesale prices per kilogram; sack totals derived from each product’s configurable sack weight.
- Mixed loose-kilogram and whole-sack orders. Stock tracked to 0.001 kg, with server-side price calculation, stock checks, atomic checkout, and retry protection.
- Cash received/change, debit last-four digits with terminal confirmation, and e-wallet reference/barcode or receipt image with payment confirmation.
- Webcam receipt capture, image upload, native camera barcode/QR scanning where supported, and keyboard-wedge USB barcode scanner input.
- Product/stock editing, customer names, fixed discounts, configurable tax and currency.
- Saved receipts, sales history/search, CSV export, browser printing, and ESC/POS IP printing.
- USB ESC/POS cash drawer trigger or drawer pulse through a network receipt printer, optionally after cash sales.

Initial data contains **six demo rice varieties** with sample stock and prices. Update these in Inventory before using the register for real sales. Defaults are PHP, 25/50 kg sacks, and zero tax. Settings can change currency; amounts are not exchange-rate converted. A wholesale pricing mode applies to the whole order. Pending carts are held in browser memory; completed orders persist.

## Payments and receipts

This application **records payments**; it does not charge cards, connect to an e-wallet provider, or verify bank settlement. Use your existing terminal/merchant app, then confirm the result in checkout. Full card numbers are never requested or stored. Only the last four digits are retained.

For e-wallets, attach a JPEG/PNG/WebP image up to 5 MB or enter/scan the transaction reference. Capturing an image does not perform OCR or authenticate payment. Camera access requires HTTPS or localhost and permission. Native `BarcodeDetector` support varies by browser; USB scanners that type text work in the reference field, with Enter prevented from submitting checkout.

## Hardware

### Network printer

Use an ESC/POS-compatible thermal printer with raw TCP enabled. Enter its private IPv4 address and port 9100 (or 9101) in Settings, save, and print a test receipt. The server running this app must be able to reach the printer on the local network. A cloud preview cannot reach your shop’s private LAN automatically. Automatic network discovery is not provided; find the address on the printer’s network configuration page. Browser printing is available on saved receipts for OS-installed printers.

Network output uses basic ASCII ESC/POS text, a cut command, and the order’s currency code. Non-ASCII store/product names are best printed through the browser. A sent command confirms socket delivery, not that paper physically printed.

### Cash drawer

- **Through the printer:** connect a compatible drawer to the printer’s RJ11/RJ12 cash drawer port and choose that connection in Settings.
- **USB:** requires a compatible ESC/POS USB device/controller with a bulk OUT endpoint. Use desktop Chrome/Edge on HTTPS or localhost, choose Connect USB device, and approve your device. Reconnect after browser restarts. An OS driver already owning the device can prevent WebUSB access.
- The pulse is `ESC p 0 25 250` (pin 2). Standalone HID/serial drawers and vendor-specific protocols require their own adapter/driver; they are not universally compatible with this implementation.
- Hardware failure does not undo a saved sale. Test physical hardware before enabling automatic cash-sale opening.

## Persistence and operation

Data is stored in `data/pos.sqlite` (including receipt images). Set `DATA_DIR` to use another location. The directory is excluded from Git. Back up this directory with the server stopped, or use a SQLite-consistent backup including WAL state. Do not delete it after real sales.

The initial version is intended for a trusted local register. Local mode has no login or employee roles, returns/refunds, accounting integration, or multi-store synchronization. Keep its network access private; add authentication and HTTPS before exposing customer/sales data to untrusted users. Order summaries exclude image data, but stored receipts are available to users with register access. For hardware, run the server at the shop; HTTPS or localhost is necessary for browser camera/USB access.

## Scan a new product and find its picture

Inventory → Add product includes **Scan barcode with camera**. Grant camera permission on HTTPS or localhost and point at an EAN/UPC or other product barcode. Scanning fills the code and automatically looks up its name/photo. Native detection is used where available, with a bundled ZXing decoder for browsers without it. A USB keyboard scanner can enter the barcode and press Enter; typing a code and clicking Look up also works.

Barcodes are saved with products and searchable in Inventory and the register. Duplicate codes are rejected, including equivalent zero-padded GTINs. Product photos appear throughout the register, cart, and inventory. Review the suggested picture, replace its HTTPS URL, or remove it. Unknown/unlisted rice sacks can still be entered manually. Photos can be external URLs or uploaded JPG/PNG/WebP images saved in SQLite. In local offline mode, remote links fall back to the illustrated sack; uploaded photos remain available without internet.

### Google Images connection

Google Images lookup is supported through [SerpApi's Google Images API](https://serpapi.com/google-images-api). Configure `SERPAPI_API_KEY` privately in the **server's environment** and restart the server. No key is exposed to the browser or stored in store settings. Google’s own Custom Search JSON API is [closed to new accounts and retires January 1, 2027](https://developers.google.com/custom-search/v1/overview), so this app does not require a new Google Custom Search account.

After each scan, the server searches Google Images using the exact barcode and any known product name. Only a result whose title or source link contains that barcode is selected automatically. Search matches still need a visual check. Repeated successful lookups are cached for five minutes (up to 100 codes); provider quotas/billing apply to Google lookups through SerpApi.

When online lookup is enabled (`OFFLINE_MODE=0`), without a configured key or when Google has no usable match, the app uses [Open Food Facts](https://world.openfoodfacts.org/) for free barcode-based food names and images. The form identifies the actual photo source and links to it; it never labels fallback images as Google results. Food database coverage varies by product and region. Open Food Facts product images are contributed under its [reuse terms](https://world.openfoodfacts.org/terms-of-use); other image rights belong to their original sources.

Only the scanned barcode is sent to Open Food Facts. When Google lookup is configured, the barcode and the public product name are sent to SerpApi. Customer, sales and payment data are never sent to these lookup services. For isolated verification, `OPEN_FOOD_FACTS_BASE_URL` and `GOOGLE_IMAGES_API_URL` can override the provider endpoints for only the POS process.

## Windows 10/11 (64-bit), Android phone and tablet

The same web application runs on desktop Chrome/Edge and Android Chrome; no APK or separate database is required. Desktop keeps the catalog and order side by side. Smaller tablets and phones have a persistent **View order** button, a dedicated order screen, and larger touch controls. Phones use bottom navigation. Rotation and switching between catalog/order keep the current cart intact.

### Install and connect

1. Run the POS server on your shop PC or another reachable host (`npm run dev`, or `npm run build` then `npm start`). Keep it running while devices are in use.
2. Open the **same POS address** on each device. `localhost` on a tablet refers to the tablet, not your PC. Use your server's shop-network hostname/IP or a configured secure host. Use HTTPS with a certificate trusted by the Android device to enable camera scanning, WebUSB and app installation across the network. Plain LAN HTTP can display the POS, but secure browser features remain unavailable.
3. Android Chrome: menu → **Add to Home screen / Install app**. PC Chrome/Edge: use the install icon/menu when offered. Settings → **Use on your devices** also shows the install button when the browser offers it. Browser installation requires HTTPS (localhost is allowed for PC testing).

The app manifest supports portrait and landscape and provides launcher icons. The service worker caches **only a reconnect screen**. It never caches API results, queues payments, or reports offline sales as completed; a live connection to your local POS PC is required, but internet is not required. Completed sales share the server database. Open carts are local to each browser tab and are not synchronized between devices; reloads clear pending carts.

### Android hardware

- Camera barcode/receipt scanning uses the rear camera when available. Allow camera permission and use HTTPS. The bundled decoder handles browsers without native BarcodeDetector.
- Network receipt printers and printer-connected cash drawers are reached by the POS server, so they can be triggered from any connected tablet/PC.
- Direct USB needs a compatible browser/device/controller. Android normally needs a USB OTG adapter and device permission; support depends on the tablet and drawer model. Use the printer connection when direct USB is unavailable.
- Browser printing depends on the OS print service/printer driver; Android may require its printer service. There is no automatic Bluetooth printing or universal USB-driver support.

Responsive layouts are checked in Chromium at desktop, phone, and tablet sizes. Physical Android camera/USB/printer behavior still needs verification with your shop devices.

## Windows installer

The prepared **Grain-POS-Setup.exe** includes the Windows x64 runtime and installs shortcuts without a separate Node.js install. Download and open it to begin. See [Windows installer instructions](WINDOWS-INSTALL.md) and [installer build notes](installer/README.md).

## Offline PC / LAN runner

Use [LOCAL-SETUP.md](LOCAL-SETUP.md) for Windows, LAN addresses, offline photos, local HTTPS, and backups. `npm start` is cross-platform and serves the production build with `OFFLINE_MODE=1` by default. `Start POS.cmd` and `start-pos.sh` launch the same runner. Production dependencies and assets are included in the prepared release ZIP; Node 24 is the only runtime prerequisite. No external requests are made during normal local-mode sales. The PC server must remain running.

## Cash book and uploaded payment proof

Use **Cash book → Money in / Money out** to record opening cash, cash in, expenses, supplier payments or withdrawals. Enter the amount and reason; optionally upload a JPG/PNG/WebP proof (up to 5 MB) or take a proof photo on a supported device. Reopen saved attachments with **Proof**.

Cash sales appear automatically at the sale total after change; do not add them manually again. Debit/e-wallet sales are excluded. Totals are all-time, grouped by currency, and represent recorded cash rather than a physical drawer count. Entries cannot be edited/deleted: record a correcting opposite entry with an explanation. Refresh to see entries made from another device.

Checkout supports optional payment-proof uploads for cash and debit as well as the existing e-wallet photo/reference flow. Proof is stored locally with the sale and available in Sales history. Product photos are uploaded in Inventory → Add/Edit product → Upload photo for offline use (up to 2 MB). Both product pictures and payment proofs remain available without internet.

## GCash, Maya and other e-wallet history

In Cash book → Money in / Money out, select **Cash**, **GCash**, **Maya** or **Other e-wallet** and enter a wallet name. Record money in/out, amount, reason and an optional payment reference. Use **Capture proof** for a camera photo, **Scan barcode / QR** for a reference, or upload a receipt. Camera access needs localhost or trusted HTTPS. A code/reference is a record, not confirmation of settlement; verify your wallet transaction separately.

History and pictures are saved in the PC database. Select an account/currency to see its all-time balance; filter saved history by dates, direction or reason/reference, open **View details**, or **Export history** to CSV. Export includes reference and attachment status; images stay in the database. Cash sales appear automatically; wallet movements, including wallet sales, are entered manually. For transfers, record an outflow from one account and an inflow to the other with the same reference. Existing cash history remains under Cash.

## Fast entry and automatic cash drawer

The cash book has large **Money in** and **Money out** buttons. The selected account carries into the form, the amount field is focused, and reason shortcuts speed up entry.

Open **Drawer settings**, choose a compatible **USB ESC/POS drawer controller** or **network receipt printer** connection, enable **Automatically open after cash sales and cash-book cash in/out**, and save. For USB, click Connect USB device and select the controller in Chrome/Edge; reconnect after restarting the browser. For printer drawers, configure the printer IP and connect the drawer to its drawer port. Test the drawer before shop use.

Cash entries trigger the drawer only after the server confirms a successful save. Wallet entries keep it closed by default; check **Open drawer after this entry is saved** when you also handle physical cash. A failure leaves the entry saved and offers **Retry drawer only**, which does not create another entry. A trigger being sent does not confirm the drawer physically opened.

Direct USB controls the device attached to the browser running the transaction. An Android phone cannot open a USB drawer attached to a different PC through this connection. Use a drawer attached to a network printer for shared PC/phone operation. Generic HID/serial, Bluetooth and proprietary USB triggers require model-specific support; this release sends the ESC/POS pin-2 drawer pulse.

## Online hosting from GitHub

See [HOSTING.md](HOSTING.md). `render.yaml` prepares a Node 24 service with persistent SQLite storage and a generated shared login. Provisioning requires your hosting account and acceptance of its plan cost. GitHub Pages cannot run this POS backend. Public mode requires a private password; normal offline Windows use is unchanged.
