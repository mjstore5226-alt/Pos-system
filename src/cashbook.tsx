import { CameraCapture } from "./camera";
import { useEffect, useState, useRef, type FormEvent } from "react";
import {
  Plus,
  RefreshCw,
  Eye,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Cable,
  Settings2,
  Camera,
  ScanLine,
  Download,
} from "lucide-react";
import { api, money, newTransactionId } from "./types";
import { Modal } from "./components";
import { useServerStatus } from "./connection";

type Entry = {
  id: string;
  source: "manual" | "sale";
  direction: "in" | "out";
  amount: number;
  currency: string;
  note: string;
  createdAt: string;
  receipt?: string;
  hasReceipt?: boolean;
  account: string;
  walletName: string;
  reference: string;
};
const accountLabel = (e: Pick<Entry, "account" | "walletName">) =>
  ({ cash: "Cash", gcash: "GCash", maya: "Maya" })[e.account] || e.walletName;
const accountKey = (e: Pick<Entry, "account" | "walletName">) =>
  e.account === "other" ? `other:${e.walletName}` : e.account;
const localDate = (value: string) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function CashBook({
  currency,
  drawerMode,
  autoDrawer,
  deviceBusy,
  usbConnected,
  openDrawer,
  configureDrawer,
}: {
  currency: string;
  drawerMode: "manual" | "usb" | "printer";
  autoDrawer: boolean;
  deviceBusy: boolean;
  usbConnected: boolean;
  openDrawer: () => Promise<boolean>;
  configureDrawer: () => void;
}) {
  const { reachable } = useServerStatus();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<"in" | "out" | null>(null);
  const [saved, setSaved] = useState<{
    entry: Entry;
    drawer: "pending" | "sent" | "failed" | "off";
  } | null>(null);
  const triggerBusy = useRef(false);
  async function retryDrawer() {
    if (triggerBusy.current) return;
    triggerBusy.current = true;
    try {
      const ok = await openDrawer();
      setSaved((s) => (s ? { ...s, drawer: ok ? "sent" : "failed" } : s));
    } finally {
      triggerBusy.current = false;
    }
  }
  const [detail, setDetail] = useState<Entry | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState(currency);
  const [account, setAccount] = useState("cash");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [directionFilter, setDirectionFilter] = useState("all");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setEntries(await api<Entry[]>("/cash-book"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const balances = entries.filter(
    (e) => e.currency === selectedCurrency && accountKey(e) === account,
  );
  const visible = balances.filter(
    (e) =>
      (directionFilter === "all" || e.direction === directionFilter) &&
      (!from || localDate(e.createdAt) >= from) &&
      (!to || localDate(e.createdAt) <= to) &&
      `${e.note} ${e.reference}`.toLowerCase().includes(search.toLowerCase()),
  );
  const accountOptions = [
    { account: "cash", walletName: "" },
    { account: "gcash", walletName: "" },
    { account: "maya", walletName: "" },
    ...entries.filter((e) => e.account === "other"),
  ].filter(
    (e, i, a) => a.findIndex((v) => accountKey(v) === accountKey(e)) === i,
  );
  function exportHistory() {
    const escape = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const rows = [
      [
        "ID",
        "Date",
        "Account",
        "Direction",
        "Amount",
        "Currency",
        "Reason",
        "Reference",
        "Photo attached",
      ],
      ...visible.map((e) => [
        e.id,
        e.createdAt,
        accountLabel(e),
        e.direction,
        e.amount,
        e.currency,
        e.note,
        e.reference,
        e.hasReceipt ? "Yes" : "No",
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(escape).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "cash-book-history.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const total = (direction: string) =>
    balances
      .filter((e) => e.direction === direction)
      .reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CASH & E-WALLET HISTORY</div>
          <h1>
            Cash book<span className="title-dot">.</span>
          </h1>
          <p>Cash, GCash, Maya and other wallet movements, saved on your PC.</p>
        </div>
      </div>
      <div className="cashbook-devicebar">
        <span>
          <Cable size={17} />
          {drawerMode === "manual"
            ? "Drawer not configured"
            : drawerMode === "usb"
              ? usbConnected
                ? "USB drawer connected"
                : "Connect your USB drawer"
              : "Drawer through network printer"}
          <b>
            {autoDrawer && drawerMode !== "manual"
              ? "Auto-open on"
              : "Auto-open off"}
          </b>
        </span>
        <button className="secondary-button" onClick={configureDrawer}>
          <Settings2 size={16} />
          Drawer settings
        </button>
      </div>
      {saved && (
        <div
          className={`cashbook-saved ${saved.drawer === "failed" ? "drawer-warning" : ""}`}
          role="status"
        >
          <CheckCircle2 size={22} />
          <div>
            <strong>
              {money(saved.entry.amount, saved.entry.currency)}{" "}
              {saved.entry.direction === "in" ? "money in" : "money out"} saved
            </strong>
            <p>
              {saved.drawer === "pending"
                ? "Sending drawer trigger…"
                : saved.drawer === "sent"
                  ? "Drawer trigger sent. Ready for the next transaction."
                  : saved.drawer === "failed"
                    ? "Your entry is saved. Drawer could not open. Check its connection, then retry the drawer only."
                    : "History updated. Ready for the next transaction."}
            </p>
          </div>
          {saved.drawer === "failed" && (
            <button
              className="secondary-button"
              disabled={deviceBusy}
              onClick={() => void retryDrawer()}
            >
              Retry drawer only
            </button>
          )}
        </div>
      )}
      <div className="cashbook-quick-actions">
        <button
          className="cashbook-action action-in"
          disabled={!reachable || loading || deviceBusy}
          onClick={() => setAdding("in")}
        >
          <ArrowDownLeft size={27} />
          <span>
            <strong>Money in</strong>
            <small>Add cash or receive funds</small>
          </span>
          <Plus size={20} />
        </button>
        <button
          className="cashbook-action action-out"
          disabled={!reachable || loading || deviceBusy}
          onClick={() => setAdding("out")}
        >
          <ArrowUpRight size={27} />
          <span>
            <strong>Money out</strong>
            <small>Pay, withdraw or deposit</small>
          </span>
          <Plus size={20} />
        </button>
      </div>
      <div className="cashbook-toolbar">
        <label>
          Account
          <select
            className="form-input"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            {accountOptions.map((e) => (
              <option key={accountKey(e)} value={accountKey(e)}>
                {accountLabel(e)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Currency{" "}
          <select
            className="form-input"
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value)}
          >
            {[...new Set([currency, ...entries.map((e) => e.currency)])].map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </label>
        <button
          className="secondary-button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <div className="cashbook-totals">
        {[
          ["Money in", total("in")],
          ["Money out", total("out")],
          [
            "Recorded balance",
            Math.round((total("in") - total("out")) * 100) / 100,
          ],
        ].map(([label, amount]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>
              {loading ? "…" : money(Number(amount), selectedCurrency)}
            </strong>
          </div>
        ))}
      </div>
      <p className="field-hint">
        All-time recorded balance for this account and currency. History filters
        below do not change the balance. Check the drawer or wallet statement to
        confirm funds.
      </p>
      <details className="cashbook-guide">
        <summary>How balances and transfers work</summary>
        <p>
          Cash sales are included automatically after change. Record wallet
          movements manually. For transfers, add money out of one account and
          money in to the other using the same reference. Correct mistakes with
          an opposite entry and a note.
        </p>
      </details>
      <h2>Saved history</h2>
      <div className="cashbook-toolbar cashbook-filters">
        <label>
          Search reason or reference
          <input
            className="form-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          From date
          <input
            className="form-input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To date
          <input
            className="form-input"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Direction
          <select
            className="form-input"
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
          >
            <option value="all">All movements</option>
            <option value="in">Money in</option>
            <option value="out">Money out</option>
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={loading || !visible.length}
          onClick={exportHistory}
        >
          <Download size={16} />
          Export history
        </button>
      </div>
      <div className="cashbook-list">
        {loading ? (
          <p>Loading cash book…</p>
        ) : !visible.length ? (
          <p>No cash entries yet.</p>
        ) : (
          visible.map((e) => (
            <article className="cashbook-row" key={`${e.source}-${e.id}`}>
              <div>
                <strong>{e.note}</strong>
                <p>
                  {new Date(e.createdAt).toLocaleString()} · {accountLabel(e)} ·{" "}
                  {e.source === "sale" ? "Automatic sale" : "Manual entry"}
                  {e.reference && <> · Reference: {e.reference}</>}
                </p>
              </div>
              <strong>
                {e.direction === "in" ? "+" : "−"}
                {money(e.amount, e.currency)}
              </strong>
              {true && (
                <button
                  className="secondary-button"
                  onClick={async () => {
                    try {
                      setDetail(
                        await api<Entry>(`/cash-book/${e.source}/${e.id}`),
                      );
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  <Eye size={16} />
                  View details
                </button>
              )}
            </article>
          ))
        )}
      </div>
      {adding && (
        <CashEntryForm
          currency={currency}
          initialDirection={adding}
          initialAccount={account}
          drawerAvailable={drawerMode !== "manual"}
          autoDrawer={autoDrawer}
          onClose={() => setAdding(null)}
          onSaved={async (entry, shouldOpen) => {
            setAccount(accountKey(entry));
            setSelectedCurrency(entry.currency);
            setSearch("");
            setFrom("");
            setTo("");
            setDirectionFilter("all");
            setAdding(null);
            setSaved({ entry, drawer: shouldOpen ? "pending" : "off" });
            void refresh();
            if (shouldOpen) {
              const ok = await openDrawer();
              setSaved({ entry, drawer: ok ? "sent" : "failed" });
            }
          }}
        />
      )}
      {detail && (
        <Modal
          title="Saved entry details"
          subtitle={detail.note}
          onClose={() => setDetail(null)}
        >
          <p>
            {accountLabel(detail)} ·{" "}
            {detail.direction === "in" ? "Money in" : "Money out"} ·{" "}
            {money(detail.amount, detail.currency)}
          </p>
          <p>{new Date(detail.createdAt).toLocaleString()}</p>
          <p className="cashbook-reference">
            Reference: {detail.reference || "Not provided"}
          </p>
          <p className="field-hint">Entry ID: {detail.id}</p>
          {detail.receipt ? (
            <img
              className="cashbook-proof"
              src={detail.receipt}
              alt="Saved proof of payment"
            />
          ) : (
            <p>No photo attached.</p>
          )}
        </Modal>
      )}
    </>
  );
}
function CashEntryForm({
  currency,
  initialDirection,
  initialAccount,
  drawerAvailable,
  autoDrawer,
  onClose,
  onSaved,
}: {
  currency: string;
  initialDirection: "in" | "out";
  initialAccount: string;
  drawerAvailable: boolean;
  autoDrawer: boolean;
  onClose: () => void;
  onSaved: (entry: Entry, shouldOpen: boolean) => Promise<void>;
}) {
  const { reachable } = useServerStatus();
  const [id] = useState(newTransactionId);
  const [direction, setDirection] = useState(initialDirection);
  const [account, setAccount] = useState(
    initialAccount.startsWith("other:") ? "other" : initialAccount,
  );
  const [walletName, setWalletName] = useState(
    initialAccount.startsWith("other:") ? initialAccount.slice(6) : "",
  );
  const [drawerChoice, setDrawerChoice] = useState<boolean | null>(null);
  const shouldOpen =
    drawerAvailable && (drawerChoice ?? (autoDrawer && account === "cash"));
  const saveLock = useRef(false);
  const amountInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => amountInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const [reference, setReference] = useState("");
  const [camera, setCamera] = useState<"photo" | "barcode" | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Choose a JPG, PNG, or WebP image up to 5 MB.");
      return;
    }
    setReading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      setReceipt(data);
    } catch {
      setError("Could not read this picture.");
    } finally {
      setReading(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saveLock.current || busy || reading || camera || !reachable) return;
    saveLock.current = true;
    setBusy(true);
    setError("");
    try {
      const entry = await api<Entry>("/cash-book", "POST", {
        id,
        account,
        walletName,
        reference,
        direction,
        amount: Number(amount),
        note,
        currency,
        receipt: receipt || null,
      });
      await onSaved(entry, shouldOpen);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={direction === "in" ? "Money in" : "Money out"}
      subtitle="Add an opening float, expense, deposit or withdrawal."
      onClose={() => {
        if (!busy && !reading) onClose();
      }}
    >
      <form onSubmit={save}>
        <fieldset disabled={busy || reading} className="payment-fields">
          <label className="form-group">
            Account
            <select
              className="form-input"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="maya">Maya</option>
              <option value="other">Other e-wallet</option>
            </select>
          </label>
          {account === "other" && (
            <label className="form-group">
              E-wallet name
              <input
                className="form-input"
                required
                maxLength={60}
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
                placeholder="e.g. ShopeePay"
              />
            </label>
          )}
          <label className="form-group">
            Movement
            <select
              className="form-input"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "in" | "out")}
            >
              <option value="in">Money in</option>
              <option value="out">Money out</option>
            </select>
          </label>
          <label className="form-group">
            Amount ({currency})
            <input
              className="form-input"
              ref={amountInput}
              inputMode="decimal"
              type="number"
              min="0.01"
              max="100000000"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="form-group">
            Reason / paid to or received from
            <input
              className="form-input"
              required
              maxLength={250}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Opening cash, supplier payment"
            />
          </label>
          <div className="cashbook-presets">
            {(direction === "in"
              ? ["Opening float", "Cash received", "Transfer in"]
              : ["Supplier payment", "Expense", "Bank deposit"]
            ).map((text) => (
              <button
                className="secondary-button"
                key={text}
                type="button"
                onClick={() => setNote(text)}
              >
                {text}
              </button>
            ))}
          </div>
          <label className="check-label cashbook-drawer-choice">
            <input
              type="checkbox"
              checked={shouldOpen}
              disabled={!drawerAvailable}
              onChange={(e) => setDrawerChoice(e.target.checked)}
            />
            Open drawer after this entry is saved
          </label>
          <p className="field-hint">
            {drawerAvailable
              ? "For e-wallet entries, select this only when physical cash is handled."
              : "Choose a USB controller or printer connection in Drawer settings to enable automatic opening."}
          </p>
          <label className="form-group">
            Payment reference / barcode
            <input
              className="form-input"
              maxLength={250}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="Type or scan a transaction reference"
            />
          </label>
          <div className="receipt-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setCamera("photo")}
            >
              <Camera size={16} />
              Capture proof
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setCamera("barcode")}
            >
              <ScanLine size={16} />
              Scan barcode / QR
            </button>
          </div>
          <p className="field-hint">
            Scanning saves the code as a reference. It does not verify payment
            or extract an amount. Confirm the transaction in your wallet
            account.
          </p>
          {camera && (
            <CameraCapture
              mode={camera}
              onClose={() => setCamera(null)}
              onCapture={(value) => {
                if (camera === "photo") setReceipt(value);
                else if (value.length > 250) {
                  setError(
                    "Scanned code is too long. Enter the transaction reference manually (up to 250 characters).",
                  );
                  setCamera(null);
                  return;
                } else setReference(value);
                setError("");
                setCamera(null);
              }}
            />
          )}
          <label className="form-group">
            Upload proof of payment (optional)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <label className="form-group">
            Take proof photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {receipt && (
            <>
              <img
                className="cashbook-proof"
                src={receipt}
                alt="Payment proof preview"
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReceipt("")}
              >
                Remove proof
              </button>
            </>
          )}
        </fieldset>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy || reading}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={busy || reading || !!camera || !reachable}
          >
            {busy
              ? "Saving…"
              : reading
                ? "Reading photo…"
                : shouldOpen
                  ? "Save & open drawer"
                  : "Save entry"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
