# Windows 10/11 (64-bit) + Android phone setup

## On your Windows 10/11 (64-bit) PC

1. Install **Node.js 24 LTS for Windows x64** once from [nodejs.org](https://nodejs.org/en/download). Choose the Windows Installer (`.msi`) for x64. You can download its installer on another computer and transfer it by USB if this PC has no internet.
2. Extract the prepared **Grain-POS-Offline.zip** to a normal writable folder, for example `C:\GrainPOS`. Do not run it inside the ZIP or a protected Program Files folder.
3. Double-click **Start POS.cmd**. The prepared ZIP already includes the built app and all runtime dependencies: no `npm install` or internet connection is needed.
4. The Windows launcher opens your default browser when the POS is ready. Leave the terminal window open. If needed, open **http://localhost:3000** in Chrome or Edge.
5. Edit the demo products, prices, and stock before real sales.

On Linux/macOS with Node 24 installed: run `sh start-pos.sh` from the extracted folder. `npm start` also works on all platforms.

If you are using the source checkout instead of the prepared ZIP, run `npm ci` and `npm run build` once while internet is available, then start with `npm start`.

## Connect your Android cellphone

- Use an updated **Google Chrome** on Android. The phone opens the POS in its browser; no APK or Node.js installation is needed on the phone. Android tablets can connect the same way.
- Connect the Windows PC and Android phone to the **same Wi-Fi/router**, even if that router has no internet service.
- The runner prints a **Local network** address, such as `http://192.168.1.20:3000`. Open that address in Android Chrome. Their `localhost` address does not point to the POS PC.
- Allow Node.js through Windows Firewall on your **private shop network** if Windows asks. Guest Wi-Fi/client isolation may prevent devices from seeing each other; use your shop's main private network.
- Keep the POS PC awake and the runner open. All devices use the same SQLite database on that PC. No cloud account or internet is required for local sales.
- Reserve the POS PC's IP in your router if you want its address to stay the same.

## What works without internet

Cash checkout and change, retail/wholesale pricing, kg/sack sales, stock updates, customers, discounts/tax, saved receipts, reports/CSV, barcode decoding, local photo uploads, and printer/drawer commands to reachable compatible hardware.

The POS checks the **local server**, so a browser's “no internet” indicator does not block a sale while the PC is reachable. If the PC or LAN goes down, sales cannot be saved until it returns. The app does not queue payments on disconnected tablets.

Automatic Google/Open Food Facts product lookup needs internet. The default runner disables those requests. Existing barcodes are looked up in local inventory; new barcodes can be saved manually. Upload JPG/PNG/WebP photos (up to 2 MB) to keep pictures in the local database. Remote image links are hidden in local mode and use the illustrated sack instead; upload the actual picture to make it available offline.

Debit/e-wallet entries record a payment you have collected separately. Your card terminal or wallet provider may still require its own internet/mobile connection. Receipt capture does not verify settlement.

## Enable the Android camera scanner and app installation

On the POS PC, `http://localhost:3000` permits camera and supported WebUSB access. On other devices, browsers require **trusted HTTPS** for cameras, WebUSB, and app installation; normal sales still work through local HTTP.

To serve HTTPS directly, obtain a certificate trusted by your devices covering the POS PC's local hostname/IP. A local certificate authority can be used on a network without internet; install its public root certificate on your tablets, and keep its private key private. Set both paths before starting (Windows Command Prompt):

```bat
set TLS_CERT_FILE=C:\GrainPOS\certs\pos.pem
set TLS_KEY_FILE=C:\GrainPOS\certs\pos-key.pem
Start POS.cmd
```

Then use the printed `https://...:3000` address matching the certificate. Do not bypass certificate warnings: camera/USB may remain blocked with an untrusted certificate. Certificate files are not included in the ZIP because they depend on your PC's hostname/IP. No public internet connection is needed once local trust is configured.

### One-time local certificate setup on Windows

For a shop without an existing certificate setup, [mkcert](https://github.com/FiloSottile/mkcert#installation) can create a certificate trusted by your own devices. Download its Windows amd64 executable from the official releases on a connected computer, rename it `mkcert.exe`, and place it in `C:\GrainPOS`. This is a separate setup tool, not included in the POS ZIP.

1. Reserve the PC's LAN IP in your router first. The commands below use **192.168.1.20 as an example**; replace it with the address printed by your runner.
2. Open Windows Command Prompt and run:

   ```bat
   cd /d C:\GrainPOS
   mkdir certs
   mkcert.exe -install
   mkcert.exe -cert-file certs\pos.pem -key-file certs\pos-key.pem localhost 127.0.0.1 192.168.1.20
   mkcert.exe -CAROOT
   ```

   Windows may ask to approve installation of your local certificate authority. The last command prints the folder containing the public `rootCA.pem` and its private key.

3. Copy **only `rootCA.pem`** to your Android phone by USB, renaming the copy to `grain-pos-root.crt`. Never copy or share `rootCA-key.pem` or `pos-key.pem`. On the phone, search Settings for **Install a certificate**, choose **CA certificate**, and select `grain-pos-root.crt`. Menu names vary by Android version; a screen lock may be required. Only install the certificate you created on your own PC.
4. Stop the existing runner with Ctrl+C. In Notepad, create `Start POS HTTPS.cmd` alongside `Start POS.cmd` (save as **All files**, not `.txt`) with:

   ```bat
   @echo off
   cd /d "%~dp0"
   set "TLS_CERT_FILE=%~dp0certs\pos.pem"
   set "TLS_KEY_FILE=%~dp0certs\pos-key.pem"
   call "Start POS.cmd"
   ```

5. Double-click `Start POS HTTPS.cmd` for future starts. On the PC use **https://localhost:3000**; on Android use **https://192.168.1.20:3000**, substituting your actual IP. Restart Chrome after installing the certificate. The page must load without a certificate warning.
6. In Inventory → Add product → Scan barcode with camera, allow camera permission. For a home-screen app, open Chrome's menu → **Add to Home screen / Install app** when offered. Scanning works locally; automatic Google pictures still need internet and a configured lookup provider.

If the PC IP changes, generate a new server certificate covering the new IP and restart the runner. Reuse the same local CA so the phone's trust remains valid. Renew the server certificate before it expires. Keep the private keys on the PC. If a managed phone disallows CA installation, its administrator must configure trusted HTTPS before camera scanning can work.

Network printers and printer-connected drawers are reached by the PC server and work from LAN tablets. Android direct USB requires compatible hardware, browser support and often an OTG adapter.

## Keep your data

Products, uploaded pictures, sales and payment receipts are in **data/pos.sqlite**. It is created at first start. To back up, stop the runner with **Ctrl+C**, then copy the entire **data** folder to another drive. Keep that folder when updating the app; never overwrite it with another register's data. Do not close the terminal or shut down the PC during a sale.

## Options and troubleshooting

- **Port busy:** stop another POS instance, or set `PORT=3001` before starting. Use the corresponding printed address.
- **PC only:** set `HOST=127.0.0.1` before starting to disable LAN access.
- **Different data folder:** set `DATA_DIR` to its full path before starting.
- **Temporarily enable internet lookup:** set `OFFLINE_MODE=0` before starting. Google Images additionally needs the private `SERPAPI_API_KEY` server environment variable. Stop and restart without that override to return to local mode.
- This runner is for your trusted shop network. It has no cashier login; do not expose its port directly to the public internet.

## Product photos, cash book and payment proofs

- **Inventory → Add/Edit product → Upload photo for offline use:** choose your product picture (JPG, PNG or WebP, up to 2 MB).
- **Cash book → Money in / Money out:** choose cash in/out, enter amount and reason, and optionally attach proof (up to 5 MB). Record opening cash here. Cash sales are included automatically after change; do not enter them twice. Debit/e-wallet sales do not affect the cash balance.
- **Checkout:** upload proof for cash/debit, or use the e-wallet camera/upload controls. Reopen it in Sales history; cash-book attachments have a Proof button. Pictures are stored locally.
- Stop the POS and back up the data folder before installing this update. Existing sales and products are preserved.

## GCash, Maya and other e-wallet history

In Cash book → Money in / Money out, select **Cash**, **GCash**, **Maya** or **Other e-wallet** and enter a wallet name. Record money in/out, amount, reason and an optional payment reference. Use **Take photo** for a camera photo, **Scan barcode / QR** for a reference, or upload a receipt. Camera access needs localhost or trusted HTTPS. A code/reference is a record, not confirmation of settlement; verify your wallet transaction separately.

History and pictures are saved in the PC database. Select an account/currency to see its all-time balance; filter saved history by dates, direction or reason/reference, open **View details**, or **Export history** to CSV. Export includes reference and attachment status; images stay in the database. Cash sales appear automatically; wallet movements, including wallet sales, are entered manually. For transfers, record an outflow from one account and an inflow to the other with the same reference. Existing cash history remains under Cash.

## Fast entry and automatic cash drawer

The cash book has large **Money in** and **Money out** buttons. The selected account carries into the form, the amount field is focused, and reason shortcuts speed up entry.

Open **Drawer settings**, choose a compatible **USB ESC/POS drawer controller** or **network receipt printer** connection, enable **Automatically open after cash sales and cash-book cash in/out**, and save. For USB, click Connect USB device and select the controller in Chrome/Edge; reconnect after restarting the browser. For printer drawers, configure the printer IP and connect the drawer to its drawer port. Test the drawer before shop use.

Cash entries trigger the drawer only after the server confirms a successful save. Wallet entries keep it closed by default; check **Open drawer after this entry is saved** when you also handle physical cash. A failure leaves the entry saved and offers **Retry drawer only**, which does not create another entry. A trigger being sent does not confirm the drawer physically opened.

Direct USB controls the device attached to the browser running the transaction. An Android phone cannot open a USB drawer attached to a different PC through this connection. Use a drawer attached to a network printer for shared PC/phone operation. Generic HID/serial, Bluetooth and proprietary USB triggers require model-specific support; this release sends the ESC/POS pin-2 drawer pulse.

## Android proof of payment

Checkout (cash, debit or e-wallet) and Cash book now share these controls:

- **Take photo:** requests the Android rear camera through the phone's photo picker.
- **Scan barcode / QR:** uses live scanning on HTTPS; on ordinary local HTTP it requests a code photo instead.
- **Upload photo:** attaches an existing receipt/screenshot.
- **Scan saved image:** reads a barcode/QR from a receipt photo or screenshot and attaches the photo too. This works without live-camera permissions and needs no internet while the local POS is reachable.

If live camera access fails, use **Use phone camera instead** or **Scan saved image**. JPG/PNG/WebP photos up to 20 MB are resized before storage (up to 5 MB per saved proof). Review readability before saving. Scanned references are kept for all payment methods and can be reopened with the payment history. A code/photo does not confirm that the money was received. Actual Android camera app behavior depends on the phone/browser.
