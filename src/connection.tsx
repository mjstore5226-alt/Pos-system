import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Connection = { reachable: boolean; offlineMode: boolean };
const ConnectionContext = createContext<Connection>({
  reachable: true,
  offlineMode: true,
});
export function ServerConnection({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<Connection>({
    reachable: true,
    offlineMode: true,
  });
  useEffect(() => {
    let disposed = false;
    let checking = false;
    let controller: AbortController | undefined;
    async function check() {
      if (checking) return;
      checking = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 3500);
      try {
        // Internet indicators can be false while the PC/LAN server is still reachable.
        const response = await fetch("/api/health", {
          cache: "no-store",
          signal: controller.signal,
        });
        const health = await response.json();
        if (
          !response.ok ||
          health.status !== "ok" ||
          health.service !== "grain-pos"
        )
          throw new Error("Server unavailable");
        if (!disposed)
          setConnection({
            reachable: true,
            offlineMode: health.offlineMode === true,
          });
      } catch {
        if (!disposed)
          setConnection((previous) => ({ ...previous, reachable: false }));
      } finally {
        clearTimeout(timeout);
        checking = false;
      }
    }
    void check();
    const interval = setInterval(check, 10000);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    window.addEventListener("focus", check);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(interval);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  return (
    <ConnectionContext.Provider value={connection}>
      {children}
    </ConnectionContext.Provider>
  );
}
export const useServerStatus = () => useContext(ConnectionContext);
export function canDisplayPhoto(
  imageUrl: string | undefined,
  offlineMode: boolean,
) {
  return !!imageUrl && (!offlineMode || imageUrl.startsWith("data:image/"));
}
