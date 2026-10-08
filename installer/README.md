# Windows offline installer

`windows.nsi` packages the prepared offline app plus the official Node.js 24.14.1 Windows x64 executable. It installs per user at `%LOCALAPPDATA%\GrainPOS`, adds shortcuts, then automatically starts the POS and opens the default browser when ready. A normal launch starts installation immediately; updates ask you to close the old POS first. It does not install a system runtime, change firewall rules, or install certificates. Uninstall keeps `data/` and `certs/`.

## Build

1. Prepare the offline release payload (production `dist`, runtime server modules, production Express dependencies, launch scripts, guides, and third-party licenses). Never include `data/`, `.env`, or certificate/private-key files.
2. Add `runtime/node.exe` from `https://nodejs.org/dist/v24.14.1/win-x64/node.exe`. Verify SHA-256 against the official `SHASUMS256.txt`: `58e74bf02fc5bbacc41dcb8bef089961cd5bddd37830b87784e4fc624d145d1f`. Include Node's LICENSE from its v24.14.1 source tag as `runtime/LICENSE`.
3. Use the current `Start POS.cmd` which prefers the bundled runtime. Include `WINDOWS-INSTALL.md` as the payload's `START-HERE.txt`.
4. With NSIS 3 installed, run:

   ```sh
   makensis -DPAYLOAD=/absolute/path/to/payload -DOUTPUT=/absolute/path/to/Grain-POS-Setup.exe installer/windows.nsi
   ```

Distribute the resulting installer with a SHA-256 checksum. The build is unsigned unless a publisher signs it separately. Linux compilation and payload inspection do not validate Windows installation, shortcuts, uninstall or Android hardware; test those on the target devices before rollout.
