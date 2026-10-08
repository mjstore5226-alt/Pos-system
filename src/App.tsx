import { PaymentProof } from "./payment-proof";
import { CameraCapture } from "./camera";
import { useServerStatus, canDisplayPhoto } from "./connection";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
} from "react";
import {
  Wheat,
  LayoutGrid,
  Package,
  ReceiptText,
  Settings2,
  Search,
  SlidersHorizontal,
  Plus,
  Minus,
  ArrowRight,
  ArrowUpRight,
  Check,
  X,
  ShoppingBag,
  ShoppingCart,
  UserRound,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  Printer,
  Usb,
  ScanLine,
  Camera,
  Upload,
  CircleHelp,
  CheckCheck,
  CircleCheck,
  CircleAlert,
  LoaderCircle,
  PanelLeftClose,
  Sprout,
  Store,
  Download,
  Pencil,
  Eye,
  Cable,
  Landmark,
} from "lucide-react";
import {
  api,
  money,
  weight,
  connectUSB,
  openUSB,
  usbSupported,
  newTransactionId,
  type Product,
  type ProductLookup,
  type Settings,
  type CartItem,
  type Order,
} from "./types";
import { CashBook } from "./cashbook";
import { DeviceSetup } from "./device";
import { Modal, RiceBag, EmptyState } from "./components";

type Page = "register" | "inventory" | "sales" | "cashbook" | "settings";
type Dialog = "checkout" | "customer" | "discount" | "clear" | "help" | null;
const initialSettings: Settings = {
  storeName: "Grain & Co.",
  subtitle: "Your neighborhood rice store",
  currency: "PHP",
  taxRate: 0,
  printerIp: "",
  printerPort: 9100,
  drawerMode: "manual",
  autoDrawer: false,
};
const icons = { cash: Banknote, debit: CreditCard, ewallet: Smartphone };

export default function App() {
  const { reachable: online, offlineMode } = useServerStatus();
  const [cartView, setCartView] = useState(false);
  const orderHeading = useRef<HTMLHeadingElement>(null);
  const cartToggle = useRef<HTMLButtonElement>(null);
  function openOrder() {
    setCartView(true);
    requestAnimationFrame(() => {
      orderHeading.current?.focus();
      window.scrollTo(0, 0);
    });
  }
  function closeOrder() {
    setCartView(false);
    requestAnimationFrame(() => cartToggle.current?.focus());
  }
  const [page, setPage] = useState<Page>("register");
  useEffect(() => {
    setCartView(false);
  }, [page]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState(initialSettings);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All rice");
  const [mode, setMode] = useState<"retail" | "wholesale">("retail");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState("Walk-in customer");
  const [discount, setDiscount] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [editProduct, setEditProduct] = useState<Product | "new" | null>(null);
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [sort, setSort] = useState("featured");
  const [showSort, setShowSort] = useState(false);
  const [usbConnected, setUsbConnected] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "debit" | "ewallet"
  >("cash");
  const stockRefreshSequence = useRef(0);
  const [orderKey, setOrderKey] = useState(() => newTransactionId());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 5500);
  }, []);
  const refresh = useCallback(async () => {
    const [p, o, s] = await Promise.all([
      api<Product[]>("/products"),
      api<Order[]>("/orders"),
      api<Settings>("/settings"),
    ]);
    setProducts(p);
    setOrders(o);
    setSettings(s);
  }, []);
  useEffect(() => {
    refresh()
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  const cash = (n: number) => money(n, settings.currency);
  const price = (p: Product) =>
    mode === "retail" ? p.retailPrice : p.wholesalePrice;
  const amount = (item: CartItem) => {
    const p = products.find((p) => p.id === item.productId)!;
    return (
      Math.round(
        (Math.round(price(p) * 100) *
          Math.round(
            item.quantity * (item.unit === "sack" ? p.sackKg : 1) * 1000,
          )) /
          1000,
      ) / 100
    );
  };
  const subtotal =
    Math.round(cart.reduce((sum, item) => sum + amount(item), 0) * 100) / 100;
  const validDiscount = Math.min(discount, subtotal);
  const tax =
    Math.round(
      ((Math.round(subtotal * 100) - Math.round(validDiscount * 100)) *
        settings.taxRate) /
        100,
    ) / 100;
  const total = Math.round((subtotal - validDiscount + tax) * 100) / 100;
  const totalWeight = cart.reduce(
    (sum, item) =>
      sum +
      item.quantity *
        (item.unit === "sack"
          ? products.find((p) => p.id === item.productId)!.sackKg
          : 1),
    0,
  );
  const filtered = products
    .filter(
      (p) =>
        (category === "All rice" || p.category === category) &&
        `${p.name} ${p.description} ${p.barcode || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "price-low"
        ? price(a) - price(b)
        : sort === "name"
          ? a.name.localeCompare(b.name)
          : Number(b.popular) - Number(a.popular),
    );
  function addItem(p: Product, unit: "kg" | "sack", quantity: number) {
    const existingKg = cart
      .filter((i) => i.productId === p.id)
      .reduce(
        (sum, i) => sum + i.quantity * (i.unit === "sack" ? p.sackKg : 1),
        0,
      );
    if (
      Math.round(
        (existingKg + quantity * (unit === "sack" ? p.sackKg : 1)) * 1000,
      ) > Math.round(p.stockKg * 1000)
    ) {
      notify(`Only ${weight(p.stockKg)} kg of ${p.name} is available.`, true);
      return false;
    }
    setCart((old) => {
      const found = old.find((i) => i.productId === p.id && i.unit === unit);
      return found
        ? old.map((i) =>
            i === found
              ? {
                  ...i,
                  quantity: Math.round((i.quantity + quantity) * 1000) / 1000,
                }
              : i,
          )
        : [...old, { productId: p.id, unit, quantity }];
    });
    return true;
  }
  function changeQuantity(index: number, delta: number) {
    const item = cart[index];
    if (delta > 0)
      addItem(
        products.find((p) => p.id === item.productId)!,
        item.unit,
        delta,
      );
    else
      setCart((old) =>
        old
          .map((i, ix) =>
            ix === index
              ? {
                  ...i,
                  quantity: Math.round((i.quantity + delta) * 1000) / 1000,
                }
              : i,
          )
          .filter((i) => i.quantity > 0),
      );
  }
  async function openDrawer() {
    setDeviceBusy(true);
    try {
      if (settings.drawerMode === "manual")
        throw new Error(
          "Choose a USB or printer cash drawer connection in Settings.",
        );
      if (settings.drawerMode === "usb") await openUSB();
      else await api("/hardware/drawer", "POST", {});
      notify("Cash drawer trigger sent.");
      return true;
    } catch (e) {
      notify((e as Error).message, true);
      return false;
    } finally {
      setDeviceBusy(false);
    }
  }
  async function showOrder(id: string) {
    try {
      setReceipt(await api<Order>(`/orders/${id}`));
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function completed(order: Order) {
    const { receipt: proof, ...summary } = order;
    setOrders((old) => [
      { ...summary, hasReceipt: !!proof },
      ...old.filter((o) => o.id !== order.id),
    ]);
    setProducts((old) =>
      old.map((p) => ({
        ...p,
        stockKg: Math.max(
          0,
          Math.round(
            (p.stockKg -
              order.items
                .filter((i) => i.productId === p.id)
                .reduce((sum, i) => sum + i.kg, 0)) *
              1000,
          ) / 1000,
        ),
      })),
    );
    setCart([]);
    setCartView(false);
    setDiscount(0);
    setCustomer("Walk-in customer");
    setOrderKey(newTransactionId());
    setDialog(null);
    setReceipt(order);
    const sequence = ++stockRefreshSequence.current;
    // Refresh current stock/settings in the background; the committed sale is ready now.
    void Promise.all([api<Product[]>("/products"), api<Settings>("/settings")])
      .then(([p, s]) => {
        if (sequence !== stockRefreshSequence.current) return;
        setProducts(p);
        setSettings(s);
      })
      .catch(() =>
        notify("Sale saved. Refresh inventory before your next sale.", true),
      );
    if (order.paymentMethod === "cash" && settings.autoDrawer)
      await openDrawer();
  }
  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          aria-label={`${settings.storeName} point of sale`}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("register");
          }}
        >
          <span className="brand-mark">
            <Wheat size={25} strokeWidth={1.65} />
          </span>
          <span>
            {settings.storeName}
            <small>RICE RETAIL & WHOLESALE</small>
          </span>
        </a>
        <div className="store-switch">
          <span className="store-icon">
            <Store size={18} />
          </span>
          <div>
            Main store<small>Register 01</small>
          </div>
          <span className="online-dot" title="Local register" />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {(
            [
              { id: "register", label: "Point of sale", icon: LayoutGrid },
              { id: "inventory", label: "Inventory", icon: Package },
              { id: "sales", label: "Sales history", icon: ReceiptText },
              { id: "cashbook", label: "Cash book", icon: Banknote },
              { id: "settings", label: "Settings", icon: Settings2 },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              aria-label={n.label}
              onClick={() => {
                setPage(n.id);
                setSearch("");
              }}
              className={page === n.id ? "nav-item active" : "nav-item"}
            >
              <n.icon size={19} strokeWidth={1.7} />
              <span>{n.label}</span>
              {n.id === "register" && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-note">
            <div className="note-icon">
              <Sprout size={24} strokeWidth={1.5} />
            </div>
            <h4>
              Good grains.
              <br />
              Great business.
            </h4>
            <p>A little simpler, every day.</p>
            <span className="note-grain">
              <Wheat size={93} strokeWidth={0.6} />
            </span>
          </div>
          <button
            className="nav-item help-button"
            aria-label="Help & guide"
            onClick={() => setDialog("help")}
          >
            <CircleHelp size={19} />
            <span>Help & guide</span>
            <ArrowUpRight size={15} />
          </button>
          <div className="profile">
            <span className="avatar">MG</span>
            <div>
              Store cashier<small>Main store</small>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="mobile-brand">
            <Wheat size={19} />
            {settings.storeName}
          </span>
          <div className="breadcrumb">
            <PanelLeftClose size={18} />
            <span className="divider" />
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>
              {
                {
                  register: "Point of sale",
                  inventory: "Inventory",
                  sales: "Sales history",
                  cashbook: "Cash book",
                  settings: "Settings",
                }[page]
              }
            </strong>
          </div>
          <div className="header-meta">
            <span className="date-label">{today}</span>
            <span
              className={`register-status ${!online ? "offline-status" : ""}`}
            >
              <span className="online-dot" />
              {online
                ? offlineMode
                  ? "Local mode"
                  : "Register open"
                : "PC disconnected"}
            </span>
          </div>
        </header>
        {!online && (
          <div className="connection-banner" role="status">
            POS PC disconnected. Reconnect to your shop network or restart the
            PC server before completing a sale.
          </div>
        )}
        <div
          className={`page-layout ${page === "register" ? "has-cart" : ""} ${cartView ? "cart-view" : ""}`}
        >
          <main className="main-content">
            {page === "register" && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">LET’S MAKE IT A GOOD DAY</div>
                    <h1>
                      Point of sale<span className="title-dot">.</span>
                    </h1>
                    <p>Quality rice, ready for every customer.</p>
                  </div>
                  <div className="mode-switch" aria-label="Pricing mode">
                    <button
                      className={mode === "retail" ? "selected" : ""}
                      onClick={() => setMode("retail")}
                    >
                      <ShoppingBag size={15} />
                      Retail
                    </button>
                    <button
                      className={mode === "wholesale" ? "selected" : ""}
                      onClick={() => setMode("wholesale")}
                    >
                      <Package size={15} />
                      Wholesale
                    </button>
                  </div>
                </div>
                <div className="welcome-banner">
                  <div className="banner-icon">
                    <Wheat size={25} strokeWidth={1.3} />
                  </div>
                  <div>
                    <strong>By the kilo. By the sack.</strong>
                    <p>
                      {mode === "retail"
                        ? "Fresh picks and fair prices. A grain for every table."
                        : "More for your business. Wholesale prices are now applied."}
                    </p>
                  </div>
                  <span className="banner-tag">
                    <span /> {mode === "retail" ? "Retail" : "Wholesale"} prices
                  </span>
                  <Wheat
                    className="banner-wheat"
                    size={106}
                    strokeWidth={0.65}
                  />
                </div>
                <div className="search-row">
                  <div className="search-field">
                    <Search size={19} />
                    <input
                      aria-label="Search rice products"
                      placeholder="Search rice by name or variety..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search ? (
                      <button
                        className="icon-button compact"
                        onClick={() => setSearch("")}
                        aria-label="Clear search"
                      >
                        <X size={15} />
                      </button>
                    ) : (
                      <kbd>⌕</kbd>
                    )}
                  </div>
                  <div className="sort-wrap">
                    <button
                      className={`filter-button ${showSort ? "selected" : ""}`}
                      aria-label="Sort products"
                      aria-expanded={showSort}
                      onClick={() => setShowSort(!showSort)}
                    >
                      <SlidersHorizontal size={18} />
                    </button>
                    {showSort && (
                      <div className="sort-menu">
                        <strong>Sort products</strong>
                        {[
                          ["featured", "Featured first"],
                          ["price-low", "Price: low to high"],
                          ["name", "Name: A to Z"],
                        ].map(([v, label]) => (
                          <button
                            key={v}
                            onClick={() => {
                              setSort(v);
                              setShowSort(false);
                            }}
                          >
                            {label}
                            {sort === v && <Check size={15} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="category-row">
                  <div className="category-tabs">
                    {["All rice", "Premium", "Regular", "Specialty"].map(
                      (c) => (
                        <button
                          key={c}
                          className={category === c ? "active" : ""}
                          onClick={() => setCategory(c)}
                        >
                          {c === "All rice" && <LayoutGrid size={14} />} {c}
                          {c === "All rice" && <span>{products.length}</span>}
                        </button>
                      ),
                    )}
                  </div>
                  <span className="product-count">
                    {filtered.length} products
                  </span>
                </div>
                {loading ? (
                  <div className="loading">
                    <LoaderCircle className="spin" />
                    Loading your rice collection…
                  </div>
                ) : loadError ? (
                  <div className="error-box">
                    {loadError}
                    <button
                      className="text-button"
                      onClick={() => window.location.reload()}
                    >
                      Try again
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  <EmptyState
                    title="No rice found"
                    description="Try another search or explore a different category."
                  >
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setSearch("");
                        setCategory("All rice");
                      }}
                    >
                      Show all rice
                    </button>
                  </EmptyState>
                ) : (
                  <div className="product-grid">
                    {filtered.map((p) => (
                      <article className="product-card" key={p.id}>
                        <button
                          className="product-image"
                          style={{ background: `${p.color}12` }}
                          onClick={() => setSelected(p)}
                          aria-label={`Choose ${p.name}`}
                        >
                          <span className="product-category">{p.category}</span>
                          {p.popular && (
                            <span className="popular-tag">
                              <span />
                              Bestseller
                            </span>
                          )}
                          <RiceBag product={p} />
                        </button>
                        <div className="product-info">
                          <div className="product-title">
                            <h3>{p.name}</h3>
                            <span
                              className={`stock-dot ${p.stockKg < 100 ? "low" : ""}`}
                              title={`${weight(p.stockKg)} kg available`}
                            />
                          </div>
                          <p>{p.description}</p>
                          <div className="product-price">
                            <strong>
                              {cash(price(p))}
                              <small>/ kg</small>
                            </strong>
                            <span>
                              {cash(price(p) * p.sackKg)}
                              <small> / {p.sackKg}kg sack</small>
                            </span>
                          </div>
                          <div className="product-bottom">
                            <span>
                              <Package size={12} />
                              {weight(p.stockKg)} kg in stock
                            </span>
                            <button
                              disabled={p.stockKg <= 0}
                              onClick={() => setSelected(p)}
                              aria-label={`Add ${p.name}`}
                            >
                              <Plus size={17} />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                <div className="catalog-footer">
                  <span>
                    <CircleCheck size={14} />
                    Thoughtfully sourced. Honestly priced.
                  </span>
                  <span>All prices in {settings.currency}</span>
                </div>
              </>
            )}
            {page === "inventory" && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">EVERY GRAIN ACCOUNTED FOR</div>
                    <h1>
                      Inventory<span className="title-dot">.</span>
                    </h1>
                    <p>One stock balance, whether you sell by kilo or sack.</p>
                  </div>
                  <button
                    className="primary-button"
                    onClick={() => setEditProduct("new")}
                  >
                    <Plus size={17} />
                    Add product
                  </button>
                </div>
                <div className="stats-grid">
                  <Stat
                    label="Rice varieties"
                    value={String(products.length)}
                    icon={<Wheat size={21} />}
                  />
                  <Stat
                    label="Total stock"
                    value={`${weight(products.reduce((s, p) => s + p.stockKg, 0))} kg`}
                    icon={<Package size={21} />}
                  />
                  <Stat
                    label="Running low"
                    value={String(
                      products.filter((p) => p.stockKg < 100).length,
                    )}
                    icon={<CircleAlert size={21} />}
                  />
                </div>
                <div className="search-field table-search">
                  <Search size={18} />
                  <input
                    aria-label="Search inventory"
                    placeholder="Search your inventory..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Retail / kg</th>
                        <th>Wholesale / kg</th>
                        <th>Sack size</th>
                        <th>Available stock</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {products
                        .filter((p) =>
                          `${p.name} ${p.barcode || ""}`
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((p) => (
                          <tr key={p.id}>
                            <td>
                              <div className="table-product">
                                <div style={{ background: `${p.color}15` }}>
                                  <RiceBag product={p} small />
                                </div>
                                <span>
                                  <strong>{p.name}</strong>
                                  <small>{p.category}</small>
                                </span>
                              </div>
                            </td>
                            <td>{cash(p.retailPrice)}</td>
                            <td>{cash(p.wholesalePrice)}</td>
                            <td>{p.sackKg} kg</td>
                            <td>
                              <span
                                className={`stock-pill ${p.stockKg < 100 ? "low" : ""}`}
                              >
                                {weight(p.stockKg)} kg
                              </span>
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Edit ${p.name}`}
                                onClick={() => setEditProduct(p)}
                              >
                                <Pencil size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!products.some((p) =>
                    `${p.name} ${p.barcode || ""}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  ) && (
                    <EmptyState
                      title="No matching products"
                      description="Try searching for another rice variety."
                    />
                  )}
                </div>
                <p className="footnote">
                  Stock below 100 kg is marked as low. Edit a product to receive
                  stock or change its sack size.
                </p>
              </>
            )}
            {page === "sales" && (
              <Sales
                orders={orders}
                search={search}
                setSearch={setSearch}
                currency={settings.currency}
                showOrder={showOrder}
              />
            )}
            {page === "cashbook" && (
              <CashBook
                currency={settings.currency}
                drawerMode={settings.drawerMode}
                autoDrawer={settings.autoDrawer}
                deviceBusy={deviceBusy}
                usbConnected={usbConnected}
                openDrawer={openDrawer}
                configureDrawer={() => setPage("settings")}
              />
            )}
            {page === "settings" && (
              <SettingsPage
                settings={settings}
                setSettings={setSettings}
                notify={notify}
                usbConnected={usbConnected}
                setUsbConnected={setUsbConnected}
                openDrawer={openDrawer}
              />
            )}
            <div hidden={page !== "settings"}>
              <DeviceSetup />
            </div>
          </main>
          {page === "register" && (
            <aside className="order-panel" aria-label="Current order">
              <button
                className="back-to-products secondary-button"
                onClick={closeOrder}
              >
                <ArrowRight size={16} style={{ transform: "rotate(180deg)" }} />
                Back to products
              </button>
              <div className="order-heading">
                <div>
                  <h2 ref={orderHeading} tabIndex={-1}>
                    Current order{" "}
                    <span>{cart.length.toString().padStart(2, "0")}</span>
                  </h2>
                  <p>
                    <span className="tiny-dot" />
                    New sale <span>•</span> Register 01
                  </p>
                </div>
                <button
                  className="icon-button"
                  disabled={!cart.length}
                  onClick={() => setDialog("clear")}
                  aria-label="Clear order"
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <button
                className="customer-select"
                onClick={() => setDialog("customer")}
              >
                <span className="customer-icon">
                  <UserRound size={18} />
                </span>
                <span>
                  {customer}
                  <small>
                    {customer === "Walk-in customer"
                      ? "Add customer to this sale"
                      : "Click to edit customer"}
                  </small>
                </span>
                <Plus size={17} />
              </button>
              <div className="order-items-heading">
                <span>ITEM</span>
                <span>AMOUNT</span>
              </div>
              <div className="order-items">
                {cart.length === 0 ? (
                  <div className="empty-cart">
                    <div className="cart-drawing">
                      <ShoppingBag size={37} strokeWidth={1.15} />
                      <span>
                        <Plus size={13} />
                      </span>
                    </div>
                    <h3>A fresh start</h3>
                    <p>
                      Add rice from the collection
                      <br />
                      to start a new order.
                    </p>
                    <span className="empty-cart-line" />
                  </div>
                ) : (
                  cart.map((item, index) => {
                    const p = products.find((p) => p.id === item.productId)!;
                    return (
                      <div
                        className="cart-item"
                        key={`${item.productId}-${item.unit}`}
                      >
                        <div className="cart-item-top">
                          <div
                            className="cart-thumb"
                            style={{ background: `${p.color}15` }}
                          >
                            <RiceBag product={p} small />
                          </div>
                          <div className="cart-item-name">
                            <strong>{p.name}</strong>
                            <span>
                              {item.unit === "sack"
                                ? `${p.sackKg} kg sack`
                                : "Loose rice · per kg"}
                            </span>
                          </div>
                          <button
                            className="icon-button compact"
                            aria-label={`Remove ${p.name} ${item.unit}`}
                            onClick={() =>
                              setCart((old) =>
                                old.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <X size={13} />
                          </button>
                        </div>
                        <div className="cart-item-bottom">
                          <div className="quantity-control">
                            <button
                              onClick={() => changeQuantity(index, -1)}
                              aria-label={`Decrease ${p.name}`}
                            >
                              <Minus size={12} />
                            </button>
                            <span>
                              {weight(item.quantity)}{" "}
                              <small>
                                {item.unit === "kg"
                                  ? "kg"
                                  : item.quantity > 1
                                    ? "sacks"
                                    : "sack"}
                              </small>
                            </span>
                            <button
                              onClick={() => changeQuantity(index, 1)}
                              aria-label={`Increase ${p.name}`}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <strong>{cash(amount(item))}</strong>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="order-summary">
                <div className="summary-line">
                  <span>
                    Subtotal <small>({weight(totalWeight)} kg)</small>
                  </span>
                  <span>{cash(subtotal)}</span>
                </div>
                <div className="summary-line">
                  <button
                    className="discount-link"
                    onClick={() => setDialog("discount")}
                    disabled={!cart.length}
                  >
                    Discount <Plus size={12} />
                  </button>
                  <span className={validDiscount ? "green-text" : ""}>
                    {validDiscount ? "−" : ""}
                    {cash(validDiscount)}
                  </span>
                </div>
                <div className="summary-line">
                  <span>Tax ({settings.taxRate}%)</span>
                  <span>{cash(tax)}</span>
                </div>
                <div className="total-line">
                  <strong>Total</strong>
                  <strong>{cash(total)}</strong>
                </div>
                <span className="payment-label">PAYMENT METHOD</span>
                <div className="payment-options">
                  {(["cash", "debit", "ewallet"] as const).map((method) => {
                    const Icon = icons[method];
                    return (
                      <button
                        key={method}
                        className={paymentMethod === method ? "active" : ""}
                        onClick={() => setPaymentMethod(method)}
                      >
                        <Icon size={20} strokeWidth={1.55} />
                        <span>
                          {method === "ewallet"
                            ? "E-wallet"
                            : method === "debit"
                              ? "Debit card"
                              : "Cash"}
                        </span>
                        {paymentMethod === method && (
                          <span className="payment-check">
                            <Check size={8} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="checkout-button"
                  disabled={!cart.length || !!loadError || !online}
                  onClick={() => setDialog("checkout")}
                >
                  <span>Charge {cash(total)}</span>
                  <ArrowRight size={19} />
                </button>
                <div className="checkout-note">
                  <CheckCheck size={13} />
                  Stock and receipts, automatically saved
                </div>
              </div>
              <div className="device-footer">
                <button onClick={() => setPage("settings")}>
                  <Printer size={14} />
                  <span>
                    {settings.printerIp ? "IP printer set" : "Set up printer"}
                  </span>
                  <span
                    className={`device-dot ${settings.printerIp ? "ready" : ""}`}
                  />
                </button>
                <span className="device-divider" />
                <button onClick={openDrawer} disabled={deviceBusy}>
                  <Usb size={14} />
                  <span>Cash drawer</span>
                  <ArrowUpRight size={12} />
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>
      {page === "register" && !cartView && (
        <button
          className="mobile-order-toggle"
          ref={cartToggle}
          onClick={openOrder}
          aria-label={`View order, ${cart.length} items, ${cash(total)}`}
        >
          <ShoppingBag size={21} />
          <span>
            View order{" "}
            <small>
              {cart.length} {cart.length === 1 ? "item" : "items"}
            </small>
          </span>
          <strong>{cash(total)}</strong>
          <ArrowRight size={18} />
        </button>
      )}
      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} role="status">
          {toast.error ? <CircleAlert size={19} /> : <CircleCheck size={19} />}
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss message">
            <X size={16} />
          </button>
        </div>
      )}
      {selected && (
        <ProductDialog
          product={selected}
          currency={settings.currency}
          price={price(selected)}
          onClose={() => setSelected(null)}
          add={(unit, qty) => {
            if (addItem(selected, unit, qty)) {
              setSelected(null);
              notify(`${selected.name} added to your order.`);
            }
          }}
        />
      )}
      {dialog === "customer" && (
        <TextDialog
          title="Customer details"
          subtitle="Add a name to keep this sale easy to find."
          label="Customer name"
          value={customer === "Walk-in customer" ? "" : customer}
          placeholder="e.g. Maria Santos"
          onClose={() => setDialog(null)}
          save={(v) => {
            setCustomer(v.trim() || "Walk-in customer");
            setDialog(null);
          }}
        />
      )}
      {dialog === "discount" && (
        <TextDialog
          title="Add a discount"
          subtitle={`Apply a fixed amount to this order. Subtotal: ${cash(subtotal)}.`}
          label={`Discount (${settings.currency})`}
          value={String(validDiscount)}
          numeric
          max={subtotal}
          onClose={() => setDialog(null)}
          save={(v) => {
            setDiscount(Number(v));
            setDialog(null);
          }}
        />
      )}
      {dialog === "clear" && (
        <Modal
          title="Clear this order?"
          subtitle="The current items, discount, and customer will be removed."
          onClose={() => setDialog(null)}
        >
          <div className="modal-actions">
            <button
              className="secondary-button"
              onClick={() => setDialog(null)}
            >
              Keep order
            </button>
            <button
              className="danger-button"
              onClick={() => {
                setCart([]);
                setDiscount(0);
                setCustomer("Walk-in customer");
                setOrderKey(newTransactionId());
                setDialog(null);
              }}
            >
              Clear order
            </button>
          </div>
        </Modal>
      )}
      {dialog === "checkout" && (
        <Checkout
          total={total}
          currency={settings.currency}
          method={paymentMethod}
          setMethod={setPaymentMethod}
          order={{
            id: orderKey,
            items: cart,
            mode,
            customer,
            discount: validDiscount,
          }}
          onClose={() => setDialog(null)}
          completed={completed}
        />
      )}
      {editProduct && (
        <ProductEditor
          product={editProduct}
          onClose={() => setEditProduct(null)}
          save={async (p) => {
            const saved = await api<Product>(
              editProduct === "new"
                ? "/products"
                : `/products/${editProduct.id}`,
              editProduct === "new" ? "POST" : "PUT",
              p,
            );
            setProducts((old) =>
              editProduct === "new"
                ? [...old, saved]
                : old.map((i) => (i.id === saved.id ? saved : i)),
            );
            setEditProduct(null);
            notify("Inventory updated.");
          }}
        />
      )}
      {receipt && (
        <Receipt
          order={receipt}
          settings={settings}
          onClose={() => setReceipt(null)}
          notify={notify}
        />
      )}
      {dialog === "help" && (
        <Modal
          title="A little help for your store"
          subtitle="Your everyday rice-selling essentials."
          onClose={() => setDialog(null)}
        >
          <div className="help-list">
            <div>
              <ShoppingCart />
              <section>
                <h3>Make a sale</h3>
                <p>
                  Choose retail or wholesale prices, select a rice variety, and
                  enter kilograms or whole sacks. You can mix both in an order.
                </p>
              </section>
            </div>
            <div>
              <ScanLine />
              <section>
                <h3>Record a payment</h3>
                <p>
                  Cash calculates your change. Debit captures the last 4 digits
                  after terminal approval. For e-wallets, take a receipt photo,
                  upload an image, or scan a reference with your barcode
                  scanner.
                </p>
              </section>
            </div>
            <div>
              <Printer />
              <section>
                <h3>Connect your hardware</h3>
                <p>
                  Settings supports local ESC/POS IP printers and compatible USB
                  drawer controllers. The POS server must be on your printer’s
                  network. You can also print through your browser.
                </p>
              </section>
            </div>
            <div>
              <Landmark />
              <section>
                <h3>Your data stays with your register</h3>
                <p>
                  Sales and receipt images are saved to this server. Back up the
                  data folder regularly. Demo inventory is included; update
                  stock and prices before real sales.
                </p>
              </section>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <span className="stat-icon">{icon}</span>
    </div>
  );
}

function ProductDialog({
  product: p,
  currency,
  price,
  onClose,
  add,
}: {
  product: Product;
  currency: string;
  price: number;
  onClose: () => void;
  add: (unit: "kg" | "sack", qty: number) => void;
}) {
  const [unit, setUnit] = useState<"kg" | "sack">("kg");
  const [qty, setQty] = useState("1");
  const kg = Number(qty) * (unit === "sack" ? p.sackKg : 1);
  return (
    <Modal title={p.name} subtitle={p.description} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add(unit, Number(qty));
        }}
      >
        <div
          className="product-dialog-preview"
          style={{ background: `${p.color}10` }}
        >
          <RiceBag product={p} />
          <div>
            <span className="pill">{p.category} rice</span>
            <h3>
              {money(price, currency)}
              <small> / kg</small>
            </h3>
            <p>{weight(p.stockKg)} kg available</p>
          </div>
        </div>
        <label className="field-label">Sell by</label>
        <div className="unit-options">
          <button
            type="button"
            className={unit === "kg" ? "active" : ""}
            onClick={() => {
              setUnit("kg");
              setQty("1");
            }}
          >
            <Wheat size={19} />
            <strong>Kilogram</strong>
            <span>Loose rice · kg</span>
          </button>
          <button
            type="button"
            className={unit === "sack" ? "active" : ""}
            onClick={() => {
              setUnit("sack");
              setQty("1");
            }}
          >
            <ShoppingBag size={19} />
            <strong>Sack</strong>
            <span>{p.sackKg} kg per sack</span>
          </button>
        </div>
        <label className="field-label" htmlFor="quantity">
          Quantity ({unit === "kg" ? "kilograms" : "sacks"})
        </label>
        <div className="large-quantity">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() =>
              setQty(
                String(Math.max(unit === "kg" ? 0.001 : 1, Number(qty) - 1)),
              )
            }
          >
            <Minus size={18} />
          </button>
          <input
            id="quantity"
            type="number"
            min={unit === "kg" ? ".001" : "1"}
            step={unit === "kg" ? ".001" : "1"}
            max={unit === "kg" ? p.stockKg : Math.floor(p.stockKg / p.sackKg)}
            value={qty}
            required
            onChange={(e) => setQty(e.target.value)}
          />
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQty(String(Number(qty) + 1))}
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="dialog-total">
          <span>{weight(kg || 0)} kg total</span>
          <strong>
            {money(
              Math.round(
                (Math.round(price * 100) * Math.round((kg || 0) * 1000)) / 1000,
              ) / 100,
              currency,
            )}
          </strong>
        </div>
        <button
          className="primary-button full"
          type="submit"
          disabled={!Number(qty) || kg > p.stockKg}
        >
          Add to order
          <Plus size={18} />
        </button>
      </form>
    </Modal>
  );
}
function TextDialog({
  title,
  subtitle,
  label,
  value,
  placeholder,
  numeric,
  max,
  onClose,
  save,
}: {
  title: string;
  subtitle: string;
  label: string;
  value: string;
  placeholder?: string;
  numeric?: boolean;
  max?: number;
  onClose: () => void;
  save: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(v);
        }}
      >
        <label className="field-label" htmlFor="text-dialog">
          {label}
        </label>
        <input
          className="form-input"
          id="text-dialog"
          type={numeric ? "number" : "text"}
          min={numeric ? 0 : undefined}
          step={numeric ? ".01" : undefined}
          max={max}
          maxLength={100}
          required={numeric}
          placeholder={placeholder}
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Save changes
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Checkout({
  total,
  currency,
  method,
  setMethod,
  order,
  onClose,
  completed,
}: {
  total: number;
  currency: string;
  method: "cash" | "debit" | "ewallet";
  setMethod: (m: "cash" | "debit" | "ewallet") => void;
  order: {
    id: string;
    items: CartItem[];
    mode: string;
    customer: string;
    discount: number;
  };
  onClose: () => void;
  completed: (order: Order) => Promise<void>;
}) {
  const { reachable: online, offlineMode } = useServerStatus();
  const [tendered, setTendered] = useState("");
  const [last4, setLast4] = useState("");
  const [reference, setReference] = useState("");
  const [photo, setPhoto] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current || busy || reading) return;
    if (!online) {
      setError("Reconnect to the POS server before completing payment.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<Order>("/orders", "POST", {
        ...order,
        paymentMethod: method,
        cashTendered: Number(tendered),
        cardLast4: last4,
        reference,
        receipt: photo || null,
        paymentConfirmed: confirmed,
        expectedTotal: total,
        expectedCurrency: currency,
      });
      await completed(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const ready =
    method === "cash"
      ? tendered !== "" && Number(tendered) >= total
      : method === "debit"
        ? /^\d{4}$/.test(last4) && confirmed
        : (!!photo || !!reference.trim()) && confirmed;
  return (
    <Modal
      title="Complete payment"
      subtitle={`${order.customer} · ${order.mode === "retail" ? "Retail" : "Wholesale"} sale`}
      onClose={() => {
        if (!busy && !reading) onClose();
      }}
    >
      <div className="payment-total">
        <span>Amount to collect</span>
        <strong>{money(total, currency)}</strong>
      </div>
      <form onSubmit={submit}>
        <div className="payment-options checkout-methods">
          {(["cash", "debit", "ewallet"] as const).map((m) => {
            const Icon = icons[m];
            return (
              <button
                key={m}
                type="button"
                disabled={busy || reading}
                className={method === m ? "active" : ""}
                onClick={() => {
                  setMethod(m);
                  setConfirmed(false);
                  setError("");
                }}
              >
                <Icon size={21} />
                {m === "cash"
                  ? "Cash"
                  : m === "debit"
                    ? "Debit card"
                    : "E-wallet"}
              </button>
            );
          })}
        </div>
        <fieldset disabled={busy} className="payment-fields">
          {method === "cash" && (
            <>
              <label className="field-label" htmlFor="tendered">
                Cash received ({currency})
              </label>
              <input
                className="form-input large-input"
                id="tendered"
                type="number"
                step=".01"
                min={total}
                required
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                placeholder="0.00"
              />
              <div className="quick-cash">
                {[
                  ...new Set([
                    total,
                    ...[100, 500, 1000, 2000, 5000]
                      .filter((n) => n > total)
                      .slice(0, 3),
                  ]),
                ].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTendered(String(n))}
                  >
                    {n === total ? "Exact amount" : money(n, currency)}
                  </button>
                ))}
              </div>
              <div className="change-line">
                <span>Change to return</span>
                <strong>
                  {money(Math.max(0, Number(tendered) - total), currency)}
                </strong>
              </div>
            </>
          )}
          {method === "debit" && (
            <>
              <div className="info-box">
                <CreditCard size={19} />
                <span>
                  Take payment on your card terminal, then record the last four
                  digits here.
                </span>
              </div>
              <label className="field-label" htmlFor="last4">
                Last 4 digits of debit card
              </label>
              <input
                id="last4"
                className="form-input card-digits"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]{4}"
                required
                placeholder="0000"
                autoComplete="off"
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
              />
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Payment is approved on the card terminal
              </label>
            </>
          )}
          {method === "ewallet" && (
            <>
              <div className="info-box">
                <Smartphone size={18} />
                <span>
                  Attach proof of payment or record a receipt reference. Verify
                  the payment in your merchant account.
                </span>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I verified this payment was received
              </label>
            </>
          )}
          <PaymentProof
            photo={photo}
            reference={reference}
            onPhoto={setPhoto}
            onReference={setReference}
            onBusyChange={setReading}
            disabled={busy}
          />
        </fieldset>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <button
          className="primary-button full"
          type="submit"
          disabled={!ready || busy || reading || !online}
        >
          {busy ? (
            <>
              <LoaderCircle size={18} className="spin" />
              Saving sale…
            </>
          ) : (
            <>
              Complete sale
              <ArrowRight size={18} />
            </>
          )}
        </button>
        <p className="payment-fineprint">
          {method === "cash"
            ? "Your stock updates automatically when the sale is saved."
            : "This records a payment already collected outside the POS."}
        </p>
      </form>
    </Modal>
  );
}

function ProductEditor({
  product,
  onClose,
  save,
}: {
  product: Product | "new";
  onClose: () => void;
  save: (p: Partial<Product>) => Promise<void>;
}) {
  const { offlineMode } = useServerStatus();
  const photoUpload = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [form, setForm] = useState(
    product === "new"
      ? {
          name: "",
          description: "",
          barcode: "",
          imageUrl: "",
          imageSource: "",
          imageSourceUrl: "",
          category: "Regular",
          retailPrice: 0,
          wholesalePrice: 0,
          sackKg: 25,
          stockKg: 0,
        }
      : product,
  );
  const [camera, setCamera] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const requestId = useRef(0);
  const autoName = useRef("");
  useEffect(
    () => () => {
      requestId.current++;
    },
    [],
  );
  function changeBarcode(barcode: string) {
    requestId.current++;
    setLookupBusy(false);
    setLookupMessage("");
    setForm((prev) => ({
      ...prev,
      barcode,
      imageUrl: "",
      imageSource: "",
      imageSourceUrl: "",
    }));
  }
  async function uploadPhoto(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setLookupMessage(
        "Choose a JPG, PNG or WebP picture no larger than 2 MB.",
      );
      return;
    }
    requestId.current++;
    setLookupBusy(false);
    setPhotoBusy(true);
    const attempt = requestId.current;
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("Could not read this picture."));
        reader.readAsDataURL(file);
      });
      if (attempt === requestId.current) {
        setForm((prev) => ({
          ...prev,
          imageUrl: data,
          imageSource: "Local photo",
          imageSourceUrl: "",
        }));
        setLookupMessage(
          "This photo will be stored on your PC and will work without internet.",
        );
      }
    } catch (e) {
      if (attempt === requestId.current) setLookupMessage((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }
  async function lookup(code: string) {
    const barcode = code.trim();
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(barcode)) {
      setLookupMessage(
        "Scan a product barcode or enter up to 64 letters, numbers, dots, dashes or underscores.",
      );
      return;
    }
    const attempt = ++requestId.current;
    setLookupBusy(true);
    setLookupMessage("Looking up this barcode and its product picture…");
    try {
      const result = await api<ProductLookup>(
        `/product-lookup/${encodeURIComponent(barcode)}`,
      );
      if (attempt !== requestId.current) return;
      const previousAutoName = autoName.current;
      setForm((prev) => ({
        ...prev,
        barcode,
        name:
          !prev.name || prev.name === previousAutoName
            ? result.name || prev.name
            : prev.name,
        description: prev.description || result.description,
        imageUrl: result.imageUrl,
        imageSource: result.imageSource,
        imageSourceUrl: result.imageSourceUrl,
      }));
      setLookupMessage(
        [
          result.imageUrl
            ? `Photo found on ${result.imageSource}. Check it matches your item.`
            : "",
          result.message,
        ]
          .filter(Boolean)
          .join(" "),
      );
      // Remember the auto-filled name for subsequent scans without replacing manual edits.
      autoName.current = result.name;
    } catch (e) {
      if (attempt === requestId.current) setLookupMessage((e as Error).message);
    } finally {
      if (attempt === requestId.current) setLookupBusy(false);
    }
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save(form);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={product === "new" ? "Add a rice variety" : "Edit rice & stock"}
      subtitle="Set prices per kilogram. Sack prices are calculated automatically."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="product-scan-section">
          <div className="product-scan-heading">
            <ScanLine size={21} />
            <div>
              <strong>Scan it. Add it.</strong>
              <p>Scan a barcode to find the product and its picture.</p>
            </div>
          </div>
          <label className="field-label" htmlFor="product-barcode">
            Product barcode
          </label>
          <div className="product-barcode-row">
            <input
              id="product-barcode"
              className="form-input"
              maxLength={64}
              value={form.barcode || ""}
              placeholder="Scan or type a barcode"
              disabled={busy}
              onChange={(e) => changeBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void lookup(form.barcode || "");
                }
              }}
            />
            <button
              className="secondary-button"
              type="button"
              disabled={lookupBusy || busy || !form.barcode?.trim()}
              onClick={() => void lookup(form.barcode || "")}
            >
              {lookupBusy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Search size={16} />
              )}
              Look up
            </button>
          </div>
          <button
            className="secondary-button full scan-product-button"
            type="button"
            disabled={busy}
            onClick={() => {
              requestId.current++;
              setLookupBusy(false);
              setCamera(true);
            }}
          >
            <Camera size={17} />
            Scan barcode with camera
          </button>
          {camera && (
            <CameraCapture
              mode="barcode"
              label="Point the camera at the product barcode"
              onClose={() => setCamera(false)}
              onCapture={(code) => {
                setCamera(false);
                changeBarcode(code);
                void lookup(code);
              }}
            />
          )}
          {lookupMessage && (
            <p className="field-hint lookup-message" role="status">
              {lookupMessage}
            </p>
          )}
        </div>
        <div className="product-photo-editor">
          <button
            className="secondary-button full"
            type="button"
            disabled={photoBusy || busy}
            onClick={() => photoUpload.current?.click()}
          >
            <Upload size={17} />
            {photoBusy ? "Reading picture…" : "Upload photo for offline use"}
          </button>
          <input
            ref={photoUpload}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              void uploadPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {offlineMode && form.imageUrl?.startsWith("https:") && (
            <p className="field-hint">
              This online picture is unavailable in local mode. Upload a copy to
              keep it on your PC.
            </p>
          )}

          {canDisplayPhoto(form.imageUrl, offlineMode) ? (
            <div className="product-photo-preview">
              <img
                key={form.imageUrl}
                src={form.imageUrl}
                alt="Product photo preview"
                referrerPolicy="no-referrer"
                onError={() =>
                  setLookupMessage(
                    "This photo could not load. Replace its URL or remove it before saving.",
                  )
                }
              />
              <div>
                <strong>Product picture</strong>
                {form.imageSourceUrl ? (
                  <a
                    href={form.imageSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {form.imageSource || "Image source"}
                    <ArrowUpRight size={13} />
                  </a>
                ) : (
                  <p>Custom image</p>
                )}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    requestId.current++;
                    setLookupBusy(false);
                    setLookupMessage("");
                    setForm({
                      ...form,
                      imageUrl: "",
                      imageSource: "",
                      imageSourceUrl: "",
                    });
                  }}
                >
                  Remove picture
                </button>
              </div>
            </div>
          ) : (
            <p className="field-hint">
              The product picture will appear here when a match is found.
            </p>
          )}
          {!form.imageUrl?.startsWith("data:") && (
            <label className="form-group">
              Product image URL
              <input
                className="form-input"
                type="url"
                maxLength={2048}
                placeholder="https://… (optional)"
                value={form.imageUrl || ""}
                onChange={(e) => {
                  requestId.current++;
                  setLookupBusy(false);
                  setForm({
                    ...form,
                    imageUrl: e.target.value,
                    imageSource: "",
                    imageSourceUrl: "",
                  });
                }}
              />
            </label>
          )}
        </div>
        <div className="form-grid">
          <label className="form-group span-two">
            Product name
            <input
              className="form-input"
              maxLength={80}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="form-group span-two">
            Short description
            <input
              className="form-input"
              maxLength={120}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <label className="form-group">
            Category
            <select
              className="form-input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {["Regular", "Premium", "Specialty"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="form-group">
            Sack weight (kg)
            <input
              className="form-input"
              type="number"
              min=".001"
              max="1000000"
              step=".001"
              required
              value={form.sackKg}
              onChange={(e) =>
                setForm({ ...form, sackKg: Number(e.target.value) })
              }
            />
          </label>
          {(["retailPrice", "wholesalePrice", "stockKg"] as const).map(
            (key) => (
              <label
                className={`form-group ${key === "stockKg" ? "span-two" : ""}`}
                key={key}
              >
                {
                  {
                    retailPrice: "Retail price / kg",
                    wholesalePrice: "Wholesale price / kg",
                    stockKg: "Available stock (kg)",
                  }[key]
                }
                <input
                  className="form-input"
                  type="number"
                  min={key === "stockKg" ? "0" : ".01"}
                  max="1000000"
                  step={key === "stockKg" ? ".001" : ".01"}
                  required
                  value={form[key]}
                  onChange={(e) =>
                    setForm({ ...form, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ),
          )}
        </div>
        <p className="field-hint">
          Available stock is the full balance, including all unopened sacks.
        </p>
        {error && <div className="error-box">{error}</div>}
        <div className="modal-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={busy || lookupBusy || camera || photoBusy}
          >
            {busy ? "Saving…" : "Save product"}
            <Check size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Sales({
  orders,
  search,
  setSearch,
  currency,
  showOrder,
}: {
  orders: Order[];
  search: string;
  setSearch: (v: string) => void;
  currency: string;
  showOrder: (id: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const today = orders.filter(
    (o) => new Date(o.createdAt).toDateString() === new Date().toDateString(),
  );
  const visible = orders.filter(
    (o) =>
      `${o.number} ${o.customer} ${o.reference || ""} ${o.cardLast4 || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" || o.paymentMethod === filter),
  );
  function exportCsv() {
    const escape = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const rows = [
      [
        "Order",
        "Date",
        "Customer",
        "Mode",
        "Method",
        "Currency",
        "Subtotal",
        "Discount",
        "Tax",
        "Total",
        "Card last 4",
        "Reference",
      ],
      ...visible.map((o) => [
        o.number,
        o.createdAt,
        o.customer,
        o.mode,
        o.paymentMethod,
        o.currency,
        o.subtotal,
        o.discount,
        o.tax,
        o.total,
        o.cardLast4,
        o.reference,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(escape).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `grain-sales-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR BUSINESS, AT A GLANCE</div>
          <h1>
            Sales history<span className="title-dot">.</span>
          </h1>
          <p>Every sale and payment, neatly in one place.</p>
        </div>
        <button
          className="secondary-button"
          disabled={!visible.length}
          onClick={exportCsv}
        >
          <Download size={17} />
          Export CSV
        </button>
      </div>
      <div className="stats-grid">
        <Stat
          label={`Today's sales (${currency})`}
          value={money(
            today
              .filter((o) => o.currency === currency)
              .reduce((s, o) => s + o.total, 0),
            currency,
          )}
          icon={<Banknote size={21} />}
        />
        <Stat
          label="Today's orders"
          value={String(today.length)}
          icon={<ReceiptText size={21} />}
        />
        <Stat
          label="Rice sold today"
          value={`${weight(today.reduce((s, o) => s + o.items.reduce((t, i) => t + i.kg, 0), 0))} kg`}
          icon={<Wheat size={21} />}
        />
      </div>
      <div className="sales-toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="Search sales"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order, customer, or reference..."
          />
        </div>
        <select
          className="form-input"
          aria-label="Filter payment method"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All payments</option>
          <option value="cash">Cash</option>
          <option value="debit">Debit card</option>
          <option value="ewallet">E-wallet</option>
        </select>
      </div>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Payment</th>
              <th>Mode</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => {
              const Icon =
                icons[o.paymentMethod as keyof typeof icons] || Banknote;
              return (
                <tr key={o.id}>
                  <td>
                    <strong>{o.number}</strong>
                    <small className="table-sub">
                      {new Date(o.createdAt).toLocaleString("en-PH", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </small>
                  </td>
                  <td>{o.customer}</td>
                  <td>
                    <span className="table-payment">
                      <Icon size={16} />
                      {o.paymentMethod === "ewallet"
                        ? "E-wallet"
                        : o.paymentMethod === "debit"
                          ? `Debit · ${o.cardLast4}`
                          : "Cash"}
                    </span>
                  </td>
                  <td>
                    <span className="pill capitalize">{o.mode}</span>
                  </td>
                  <td>
                    <strong>{money(o.total, o.currency)}</strong>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`View ${o.number}`}
                      onClick={() => showOrder(o.id)}
                    >
                      <Eye size={17} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && (
          <EmptyState
            title={
              orders.length
                ? "No matching sales"
                : "Your first sale is just ahead"
            }
            description={
              orders.length
                ? "Try a different search or payment filter."
                : "Completed orders and receipts will appear here."
            }
          />
        )}
      </div>
    </>
  );
}

function SettingsPage({
  settings,
  setSettings,
  notify,
  usbConnected,
  setUsbConnected,
  openDrawer,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  notify: (s: string, error?: boolean) => void;
  usbConnected: boolean;
  setUsbConnected: (v: boolean) => void;
  openDrawer: () => Promise<boolean>;
}) {
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [hardwareBusy, setHardwareBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await api<Settings>("/settings", "PUT", form);
      setSettings(saved);
      notify("Store settings saved.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    setHardwareBusy(true);
    try {
      await connectUSB();
      setUsbConnected(true);
      notify("USB device connected for this session.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setHardwareBusy(false);
    }
  }
  async function testPrinter() {
    setHardwareBusy(true);
    try {
      await api("/hardware/test", "POST", {});
      notify("Test receipt sent to your printer.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setHardwareBusy(false);
    }
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOUR OWN</div>
          <h1>
            Store settings<span className="title-dot">.</span>
          </h1>
          <p>The details that keep your counter running smoothly.</p>
        </div>
        <span className="pill">
          <Store size={14} />
          Main store
        </span>
      </div>
      <form className="settings-form" onSubmit={save}>
        <section className="settings-card">
          <div className="section-heading">
            <div className="section-icon">
              <Store size={20} />
            </div>
            <div>
              <h2>Store details</h2>
              <p>Your identity, currency, and tax preferences.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="form-group">
              Store name
              <input
                className="form-input"
                required
                maxLength={80}
                value={form.storeName}
                onChange={(e) =>
                  setForm({ ...form, storeName: e.target.value })
                }
              />
            </label>
            <label className="form-group">
              Store tagline
              <input
                className="form-input"
                maxLength={120}
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              />
            </label>
            <label className="form-group">
              Currency
              <select
                className="form-input"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                {[
                  ["PHP", "Philippine Peso (₱)"],
                  ["USD", "US Dollar ($)"],
                  ["MYR", "Malaysian Ringgit (RM)"],
                  ["INR", "Indian Rupee (₹)"],
                  ["IDR", "Indonesian Rupiah (Rp)"],
                  ["SGD", "Singapore Dollar (S$)"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-group">
              Sales tax (%)
              <input
                className="form-input"
                type="number"
                min="0"
                max="100"
                step=".01"
                required
                value={form.taxRate}
                onChange={(e) =>
                  setForm({ ...form, taxRate: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <p className="field-hint">
            Tax is added after discounts. Currency changes apply to new sales;
            product prices keep their numeric value.
          </p>
        </section>
        <section className="settings-card">
          <div className="section-heading">
            <div className="section-icon">
              <Printer size={20} />
            </div>
            <div>
              <h2>Receipt printer</h2>
              <p>Connect an ESC/POS printer on your local network.</p>
            </div>
            <span className="pill">Network / IP</span>
          </div>
          <div className="form-grid">
            <label className="form-group">
              Printer IP address
              <input
                className="form-input"
                placeholder="e.g. 192.168.1.100"
                value={form.printerIp}
                onChange={(e) =>
                  setForm({ ...form, printerIp: e.target.value })
                }
              />
            </label>
            <label className="form-group">
              Printer port
              <select
                className="form-input"
                value={form.printerPort}
                onChange={(e) =>
                  setForm({ ...form, printerPort: Number(e.target.value) })
                }
              >
                <option value={9100}>9100 (standard)</option>
                <option value={9101}>9101</option>
              </select>
            </label>
          </div>
          <div className="info-box">
            <Cable size={19} />
            <span>
              The POS server must be on the same network as your printer. Enter
              its IP from the printer’s network settings. Browser printing is
              also available on every receipt.
            </span>
          </div>
          <button
            className="secondary-button"
            type="button"
            disabled={dirty || hardwareBusy || !settings.printerIp}
            onClick={testPrinter}
          >
            <Printer size={16} />
            {hardwareBusy ? "Connecting…" : "Print test receipt"}
          </button>
          {dirty && (
            <p className="field-hint">
              Save your settings before testing hardware.
            </p>
          )}
        </section>
        <section className="settings-card">
          <div className="section-heading">
            <div className="section-icon">
              <Usb size={20} />
            </div>
            <div>
              <h2>Cash drawer</h2>
              <p>One click to open. One less thing to think about.</p>
            </div>
          </div>
          <label className="form-group">
            Connection
            <select
              className="form-input"
              value={form.drawerMode}
              onChange={(e) =>
                setForm({
                  ...form,
                  drawerMode: e.target.value as Settings["drawerMode"],
                  autoDrawer:
                    e.target.value === "manual" ? false : form.autoDrawer,
                })
              }
            >
              <option value="manual">Manual / no device connected</option>
              <option value="usb">USB ESC/POS drawer controller</option>
              <option value="printer">
                Connected to network printer (RJ11 / RJ12)
              </option>
            </select>
          </label>
          {form.drawerMode === "usb" && (
            <>
              <div className="info-box">
                <Usb size={19} />
                <span>
                  Requires a compatible ESC/POS USB controller, Chrome or Edge,
                  and HTTPS or localhost. Reconnect after restarting the
                  browser. Standard USB HID drawers may require a manufacturer
                  driver.
                </span>
              </div>
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={hardwareBusy || !usbSupported()}
                  onClick={connect}
                >
                  <Usb size={16} />
                  {usbConnected ? "Reconnect USB device" : "Connect USB device"}
                </button>
                {usbConnected && (
                  <span className="green-text">
                    <Check size={15} />
                    Connected this session
                  </span>
                )}
              </div>
              {!usbSupported() && (
                <p className="field-hint">
                  WebUSB is unavailable in this browser. Try Chrome or Edge on
                  desktop.
                </p>
              )}
            </>
          )}
          {form.drawerMode === "printer" && (
            <p className="field-hint">
              Connect the drawer cable to your ESC/POS printer’s drawer port.
              The trigger uses pin 2.
            </p>
          )}
          <label className="check-label">
            <input
              type="checkbox"
              disabled={form.drawerMode === "manual"}
              checked={form.autoDrawer && form.drawerMode !== "manual"}
              onChange={(e) =>
                setForm({ ...form, autoDrawer: e.target.checked })
              }
            />
            Automatically open after cash sales and cash-book cash in/out
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={dirty || settings.drawerMode === "manual" || hardwareBusy}
            onClick={async () => {
              setHardwareBusy(true);
              try {
                await openDrawer();
              } finally {
                setHardwareBusy(false);
              }
            }}
          >
            <ArrowUpRight size={16} />
            Test cash drawer
          </button>
        </section>
        <div className="settings-save">
          <span>
            {dirty
              ? "You have unsaved changes"
              : "Your settings are up to date"}
          </span>
          <button
            type="submit"
            className="primary-button"
            disabled={busy || !dirty}
          >
            {busy ? "Saving…" : "Save settings"}
            <Check size={17} />
          </button>
        </div>
      </form>
    </>
  );
}

function Receipt({
  order,
  settings,
  onClose,
  notify,
}: {
  order: Order;
  settings: Settings;
  onClose: () => void;
  notify: (v: string, error?: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const format = (n: number) => money(n, order.currency);
  async function printNetwork() {
    setBusy(true);
    try {
      await api(`/hardware/print/${order.id}`, "POST", {});
      notify("Receipt sent to the printer.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Sale complete"
      subtitle="All saved. Thank you for a good day’s business."
      onClose={onClose}
    >
      <div className="sale-success">
        <CircleCheck size={30} />
        <span>Payment recorded</span>
        <strong>{format(order.total)}</strong>
      </div>
      <div className="printable-receipt">
        <div className="receipt-brand">
          <Wheat size={24} />
          <h3>{order.storeName}</h3>
          <p>
            {order.number} · {new Date(order.createdAt).toLocaleString("en-PH")}
          </p>
          <p>
            {order.customer} · {order.mode}
          </p>
        </div>
        <div className="receipt-lines">
          {order.items.map((i, index) => (
            <div key={index}>
              <span>
                <strong>{i.name}</strong>
                <small>
                  {weight(i.quantity)} {i.unit}
                  {i.unit === "sack" ? ` × ${i.sackKg} kg` : ""} ·{" "}
                  {format(i.pricePerKg)}/kg
                </small>
              </span>
              <strong>{format(i.amount)}</strong>
            </div>
          ))}
        </div>
        <div className="receipt-totals">
          <div>
            <span>Subtotal</span>
            <span>{format(order.subtotal)}</span>
          </div>
          <div>
            <span>Discount</span>
            <span>−{format(order.discount)}</span>
          </div>
          <div>
            <span>Tax</span>
            <span>{format(order.tax)}</span>
          </div>
          <div className="receipt-grand-total">
            <strong>Total</strong>
            <strong>{format(order.total)}</strong>
          </div>
          <div>
            <span className="capitalize">
              {order.paymentMethod === "ewallet"
                ? "E-wallet"
                : order.paymentMethod}
              {order.cardLast4 ? ` · **** ${order.cardLast4}` : ""}
            </span>
            <span>Paid</span>
          </div>
          {order.paymentMethod === "cash" && (
            <>
              <div>
                <span>Cash received</span>
                <span>{format(order.cashTendered || 0)}</span>
              </div>
              <div>
                <span>Change</span>
                <strong>{format(order.change)}</strong>
              </div>
            </>
          )}
          {order.reference && (
            <div className="receipt-reference">
              <span>Reference</span>
              <span>{order.reference}</span>
            </div>
          )}
        </div>
        <p className="receipt-thanks">
          Good grains. Great days. See you again!
        </p>
      </div>
      {order.receipt && (
        <details className="attached-receipt">
          <summary>
            <Camera size={15} />
            View payment receipt
          </summary>
          <img src={order.receipt} alt="Proof of payment" />
        </details>
      )}
      <div className="receipt-print-actions">
        <button className="secondary-button" onClick={() => window.print()}>
          <Printer size={16} />
          Browser print
        </button>
        <button
          className="secondary-button"
          onClick={printNetwork}
          disabled={!settings.printerIp || busy}
        >
          <Cable size={16} />
          {busy ? "Sending…" : "IP printer"}
        </button>
      </div>
      <button className="primary-button full" onClick={onClose}>
        Back to register
        <ArrowRight size={17} />
      </button>
    </Modal>
  );
}
