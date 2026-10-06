/*
  The cart: a tiny external store read with useSyncExternalStore.
  Kept in localStorage for the visitor, synced across tabs. Prices here are for display only;
  place_order() recomputes them from the database.
*/

export type CartLine = {
  id: string;
  slug: string;
  name_ar: string;
  volume_ml: number | null;
  price_ils: number;
  image_path: string | null;
  qty: number;
};

export const MAX_QTY = 20;
export const MAX_LINES = 30;
const KEY = "adli-cart";
const EMPTY: CartLine[] = [];

let lines: CartLine[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function isLine(x: unknown): x is CartLine {
  if (!x || typeof x !== "object") return false;
  const l = x as Record<string, unknown>;
  return (
    typeof l.id === "string" &&
    typeof l.slug === "string" &&
    typeof l.name_ar === "string" &&
    typeof l.price_ils === "number" &&
    typeof l.qty === "number" &&
    Number.isInteger(l.qty) &&
    l.qty >= 1 &&
    l.qty <= MAX_QTY
  );
}

function read(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw?.v === 1 && Array.isArray(raw.lines)) return raw.lines.filter(isLine).slice(0, MAX_LINES);
  } catch {
    // Storage blocked or corrupt: start empty.
  }
  return EMPTY;
}

function write(next: CartLine[]) {
  lines = next;
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, lines }));
  } catch {
    // Storage blocked (private mode): the cart lasts for this page only.
  }
  listeners.forEach((l) => l());
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  lines = read();
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    lines = read();
    listeners.forEach((l) => l());
  });
}

export const cartStore = {
  subscribe(listener: () => void) {
    ensureLoaded();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): CartLine[] {
    ensureLoaded();
    return lines;
  },
  getServerSnapshot(): CartLine[] {
    return EMPTY;
  },
  add(product: Omit<CartLine, "qty">, qty = 1) {
    const existing = lines.find((l) => l.id === product.id);
    if (existing) {
      write(lines.map((l) => (l.id === product.id ? { ...l, ...product, qty: Math.min(MAX_QTY, l.qty + qty) } : l)));
    } else if (lines.length < MAX_LINES) {
      write([...lines, { ...product, qty: Math.min(MAX_QTY, qty) }]);
    }
  },
  setQty(id: string, qty: number) {
    if (qty <= 0) write(lines.filter((l) => l.id !== id));
    else write(lines.map((l) => (l.id === id ? { ...l, qty: Math.min(MAX_QTY, qty) } : l)));
  },
  remove(id: string) {
    write(lines.filter((l) => l.id !== id));
  },
  clear() {
    write(EMPTY);
  },
};
