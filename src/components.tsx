import { useServerStatus, canDisplayPhoto } from "./connection";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X, Wheat } from "lucide-react";
import type { Product } from "./types";

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const heading = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(
      "input, select, button, textarea",
    );
    first?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key === "Tab") {
        const elements = [
          ...(ref.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
          ) || []),
        ].filter((el) => el.offsetParent !== null);
        const firstEl = elements[0],
          lastEl = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl?.focus();
        }
        if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
      >
        <div className="modal-heading">
          <div>
            <h2 id={heading}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function RiceBag({
  product,
  small = false,
}: {
  product: Product;
  small?: boolean;
}) {
  const { offlineMode } = useServerStatus();
  const id = useId().replace(/:/g, "");
  const [failedImage, setFailedImage] = useState("");
  if (
    canDisplayPhoto(product.imageUrl, offlineMode) &&
    failedImage !== product.imageUrl
  )
    return (
      <img
        className={`rice-bag product-photo ${small ? "small" : ""}`}
        src={product.imageUrl}
        alt={product.name}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedImage(product.imageUrl || "")}
      />
    );
  return (
    <svg
      className={`rice-bag ${small ? "small" : ""}`}
      viewBox="0 0 180 200"
      role="img"
      aria-label={`${product.name} rice sack`}
    >
      <defs>
        <linearGradient id={`bag${id}`} x1="0" x2="1">
          <stop stopColor="#d9d3be" />
          <stop offset=".15" stopColor="#f2efdf" />
          <stop offset=".48" stopColor="#fffef4" />
          <stop offset=".85" stopColor="#e9e5d4" />
          <stop offset="1" stopColor="#c9c2ac" />
        </linearGradient>
        <linearGradient id={`label${id}`} x1="0" x2="1">
          <stop stopColor={product.color} />
          <stop offset=".6" stopColor={product.color} />
          <stop offset="1" stopColor={product.color} stopOpacity=".85" />
        </linearGradient>
        <filter id={`shadow${id}`} x="-40%" y="-20%" width="180%" height="160%">
          <feDropShadow
            dx="2"
            dy="7"
            stdDeviation="5"
            floodColor="#4a4b37"
            floodOpacity=".15"
          />
        </filter>
        <pattern
          id={`texture${id}`}
          width="3"
          height="3"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 0H3M0 0V3"
            stroke="#9b9269"
            strokeOpacity=".08"
            strokeWidth=".5"
          />
        </pattern>
      </defs>
      <ellipse cx="92" cy="181" rx="48" ry="5" fill="#4c4935" opacity=".08" />
      <g filter={`url(#shadow${id})`} transform="rotate(-4 90 100)">
        <path
          d="M46 23Q90 19 134 23L131 39Q137 85 145 167Q147 178 131 180L48 180Q35 178 36 166L49 40Z"
          fill={`url(#bag${id})`}
        />
        <path d="M46 23Q90 19 134 23L134 31Q92 28 46 31Z" fill="#e1dcc9" />
        <path
          d="M47 25L132 25"
          stroke="#aaa28c"
          strokeDasharray="1.4 1.8"
          strokeWidth="1"
        />
        <path
          d="M47 38Q59 54 43 165M132 40Q124 77 137 170"
          fill="none"
          stroke="#b5ad94"
          strokeOpacity=".2"
          strokeWidth="2"
        />
        <path
          d="M43 62Q90 59 136 62L143 160Q91 166 37 160Z"
          fill={`url(#label${id})`}
        />
        <path
          d="M44 64Q90 61 136 64M38 157Q90 163 142 157"
          stroke="#fff"
          strokeOpacity=".4"
          fill="none"
        />
        <g fill="#fff">
          <text
            x="90"
            y="80"
            textAnchor="middle"
            fontSize="7"
            fontFamily="Georgia"
            letterSpacing="2"
          >
            GRAIN & CO.
          </text>
          <path
            d="M90 108V88m0 16q-11-1-9-8 9 0 9 8m0-6q10-1 9-8-9 0-9 8"
            stroke="white"
            strokeWidth="1.2"
            fill="none"
          />
          <text
            x="90"
            y="121"
            textAnchor="middle"
            fontSize={product.label.length > 11 ? 8.4 : 11}
            fontWeight="bold"
            fontFamily="Georgia"
            letterSpacing=".6"
          >
            {product.label.length > 20
              ? product.label.slice(0, 20)
              : product.label}
          </text>
          <text
            x="90"
            y="134"
            textAnchor="middle"
            fontSize="6"
            letterSpacing=".3"
          >
            {product.tagline}
          </text>
          <path
            d="M65 142H115"
            stroke="white"
            strokeOpacity=".5"
            strokeWidth=".5"
          />
          <text
            x="90"
            y="153"
            textAnchor="middle"
            fontSize="7"
            fontFamily="Arial"
          >
            NET WT. {product.sackKg} KG
          </text>
        </g>
        <path
          d="M46 23Q90 19 134 23L131 39Q137 85 145 167Q147 178 131 180L48 180Q35 178 36 166L49 40Z"
          fill={`url(#texture${id})`}
        />
        <path
          d="M49 171Q89 174 132 171"
          stroke="#c0b79c"
          strokeWidth=".6"
          fill="none"
        />
      </g>
    </svg>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-illustration">
        <Wheat size={30} strokeWidth={1.35} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
