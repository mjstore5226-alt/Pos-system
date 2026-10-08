import { useServerStatus } from "./connection";
import { useEffect, useState } from "react";
import { Download, MonitorSmartphone, Check } from "lucide-react";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function DeviceSetup() {
  const { reachable, offlineMode } = useServerStatus();
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    const available = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  async function install() {
    if (!prompt) return;
    try {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
    } catch {
      setError(
        "Use your browser menu to install this app or add it to your home screen.",
      );
    }
  }
  return (
    <section className="settings-card device-setup">
      <div className="section-heading">
        <div className="section-icon">
          <MonitorSmartphone size={20} />
        </div>
        <div>
          <h2>Use on your devices</h2>
          <p>One POS for your PC, Android phone, and tablet.</p>
        </div>
      </div>
      <p>
        Open the same secure POS address on each device. Use Chrome or Edge on
        your PC, or Chrome on Android.
      </p>
      <div className="info-box">
        {reachable
          ? offlineMode
            ? "Local offline mode: connected to your POS PC. Internet is not required for sales, inventory or receipts."
            : "Connected to your POS server. Online product-image lookup is enabled."
          : "Your POS PC is not reachable. Check that it is running and your device is connected to the shop network."}
      </div>
      <div className="device-install-row">
        {installed ? (
          <span className="green-text">
            <Check size={17} />
            Running as an installed app
          </span>
        ) : prompt ? (
          <button className="secondary-button" type="button" onClick={install}>
            <Download size={16} />
            Install POS on this device
          </button>
        ) : (
          <p className="field-hint">
            Android: Chrome menu → Add to Home screen / Install app. PC: use the
            install icon in Chrome or Edge’s address bar when available.
          </p>
        )}
      </div>
      <p className="field-hint">
        Keep the POS PC running and connected to your local network. Internet is
        optional. Camera scanning and USB access require HTTPS or localhost.
        Network printing works through the server; USB drawers on Android also
        need a compatible OTG adapter and device.
      </p>
      {!window.isSecureContext && (
        <div className="info-box">
          This address uses an insecure connection. Open your HTTPS POS address
          to enable camera scanning and app installation.
        </div>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
