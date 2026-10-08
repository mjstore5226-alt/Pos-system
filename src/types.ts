export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  retailPrice: number;
  wholesalePrice: number;
  sackKg: number;
  stockKg: number;
  color: string;
  label: string;
  tagline: string;
  popular: boolean;
  barcode?: string;
  imageUrl?: string;
  imageSource?: string;
  imageSourceUrl?: string;
};
export type Settings = {
  storeName: string;
  subtitle: string;
  currency: string;
  taxRate: number;
  printerIp: string;
  printerPort: number;
  drawerMode: "manual" | "usb" | "printer";
  autoDrawer: boolean;
};
export type CartItem = {
  productId: string;
  unit: "kg" | "sack";
  quantity: number;
};
export type Order = {
  id: string;
  number: string;
  createdAt: string;
  mode: "retail" | "wholesale";
  customer: string;
  items: (CartItem & {
    name: string;
    sackKg: number;
    kg: number;
    pricePerKg: number;
    amount: number;
  })[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  storeName: string;
  paymentMethod: string;
  cardLast4?: string;
  reference?: string;
  receipt?: string;
  hasReceipt?: boolean;
  cashTendered?: number;
  change: number;
};
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
export const money = (value: number, currency = "PHP") =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
export const weight = (value: number) =>
  new Intl.NumberFormat("en-PH", { maximumFractionDigits: 3 }).format(value);
// WebUSB access is granted explicitly by the cashier for this browser session.
// A compatible ESC/POS printer or USB drawer controller must expose a bulk OUT endpoint.
interface USBEndpoint {
  direction: string;
  type: string;
  endpointNumber: number;
}
interface USBInterface {
  interfaceNumber: number;
  alternate: { endpoints: USBEndpoint[] };
}
interface USBDevice {
  opened: boolean;
  configuration?: { interfaces: USBInterface[] };
  open(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(n: number, data: Uint8Array): Promise<{ status: string }>;
  close(): Promise<void>;
}
let drawerDevice: USBDevice | null = null;
let drawerEndpoint = 0;
export function usbSupported() {
  return "usb" in navigator;
}
export async function connectUSB() {
  const usb = (
    navigator as unknown as {
      usb?: {
        requestDevice(options: { filters: object[] }): Promise<USBDevice>;
      };
    }
  ).usb;
  if (!usb)
    throw new Error(
      "USB access needs Chrome or Edge on a secure connection, and a compatible ESC/POS device.",
    );
  const device = await usb.requestDevice({ filters: [] });
  try {
    await device.open();
    if (!device.configuration) await device.selectConfiguration(1);
    const intf = device.configuration?.interfaces.find((i) =>
      i.alternate.endpoints.some(
        (e) => e.direction === "out" && e.type === "bulk",
      ),
    );
    if (!intf)
      throw new Error(
        "This device has no compatible ESC/POS USB output. Use a supported drawer controller or printer connection.",
      );
    await device.claimInterface(intf.interfaceNumber);
    drawerEndpoint = intf.alternate.endpoints.find(
      (e) => e.direction === "out" && e.type === "bulk",
    )!.endpointNumber;
    drawerDevice = device;
  } catch (err) {
    if (device.opened) await device.close();
    throw err;
  }
}
export async function openUSB() {
  if (!drawerDevice?.opened)
    throw new Error("Connect the USB drawer in Settings first.");
  const result = await drawerDevice.transferOut(
    drawerEndpoint,
    new Uint8Array([0x1b, 0x70, 0, 25, 250]),
  );
  if (result.status !== "ok")
    throw new Error(
      "The drawer did not accept the trigger. Check the device connection.",
    );
}

export type ProductLookup = {
  barcode: string;
  name: string;
  description: string;
  imageUrl: string;
  imageSource: string;
  imageSourceUrl: string;
  message: string;
};

// getRandomValues works on local-network HTTP pages where randomUUID may be unavailable.
export function newTransactionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
