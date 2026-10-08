import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import { ServerConnection } from "./connection";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ServerConnection>
      <App />
    </ServerConnection>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The online POS still works if app installation support is unavailable.
    });
  });
}
