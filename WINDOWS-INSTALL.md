# Install Grain POS on Windows 10/11 (64-bit)

1. Download **Grain-POS-Setup.exe**, then open it from Downloads. Downloading alone cannot run an installer.
2. Opening the installer starts installation automatically. It closes when finished and launches the POS. The installer includes Node.js and the POS files, so no separate runtime installation or internet connection is needed.
3. Your default browser opens automatically once the POS is ready. Leave the POS terminal open. If the browser does not open, visit **http://localhost:3000** in Chrome or Edge. The Start menu also has **Grain POS → Open POS in browser**.
4. Next time, use the **Grain POS** desktop shortcut. It starts the server and opens your browser automatically.

The installer is unsigned, so Windows may show an unknown-publisher warning. This package has been built and inspected on Linux; actual Windows installation still needs testing.

## Your Android cellphone

Connect the phone to the same shop Wi-Fi and open the **Local network** address printed by the Windows POS terminal in Android Chrome. Keep the PC awake and its terminal running. Internet is not needed for ordinary local sales. If prompted, allow Node.js through Windows Firewall for your private shop network.

Android camera scanning requires trusted HTTPS. See **LOCAL-SETUP.md** in the installed folder for the certificate steps; use `%LOCALAPPDATA%\GrainPOS` instead of the guide's example `C:\GrainPOS` path. Automatic Google pictures require internet and the configured lookup provider.

## Data, updates and removal

The app is installed for your Windows account at **%LOCALAPPDATA%\GrainPOS**. Paste that path into File Explorer to open it. Sales, stock and photos are stored in its **data** folder.

Before updating or uninstalling, stop the terminal with Ctrl+C and back up the entire data folder. Installing again uses the same location and retains that folder. Windows Settings → Apps → Grain POS removes the application and shortcuts but keeps your data and certificates. If you used the earlier ZIP release, stop it and copy its entire data folder into the installed folder before making any sales with the installed version. Do not run both copies.

Use one Windows account as the shop's host: different Windows users install separate copies and databases. Android connects to whichever host is running.

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

The installer includes the app, Windows x64 runtime, local database setup and shortcuts. Windows may still ask to allow the unsigned installer or private-network access. Hardware permissions and Android certificate trust must be configured on those devices.

## Android proof of payment

Checkout (cash, debit or e-wallet) and Cash book now share these controls:

- **Take photo:** requests the Android rear camera through the phone's photo picker.
- **Scan barcode / QR:** uses live scanning on HTTPS; on ordinary local HTTP it requests a code photo instead.
- **Upload photo:** attaches an existing receipt/screenshot.
- **Scan saved image:** reads a barcode/QR from a receipt photo or screenshot and attaches the photo too. This works without live-camera permissions and needs no internet while the local POS is reachable.

If live camera access fails, use **Use phone camera instead** or **Scan saved image**. JPG/PNG/WebP photos up to 20 MB are resized before storage (up to 5 MB per saved proof). Review readability before saving. Scanned references are kept for all payment methods and can be reopened with the payment history. A code/photo does not confirm that the money was received. Actual Android camera app behavior depends on the phone/browser.
