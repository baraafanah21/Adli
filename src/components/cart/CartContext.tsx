"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { cartStore, type CartLine } from "@/lib/cart-store";
import { OrderSheet } from "@/components/cart/OrderSheet";

type CartUI = { sheetOpen: boolean; openSheet: () => void; closeSheet: () => void };

const CartUIContext = createContext<CartUI | null>(null);

type Prefill = { full_name: string | null; area: string | null; phone: string | null } | null;

/** Holds the order sheet's open state and renders the sheet once for the whole page. */
export function CartProvider({ children, userId, prefill }: { children: ReactNode; userId: string | null; prefill: Prefill }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const ui = useMemo(
    () => ({ sheetOpen, openSheet: () => setSheetOpen(true), closeSheet: () => setSheetOpen(false) }),
    [sheetOpen],
  );
  return (
    <CartUIContext.Provider value={ui}>
      {children}
      {/* Re-mount on sign-in/out so the fields pick up the new profile. */}
      <OrderSheet key={userId ?? "guest"} open={sheetOpen} onClose={ui.closeSheet} prefill={prefill} />
    </CartUIContext.Provider>
  );
}

export function useCartUI() {
  const ui = useContext(CartUIContext);
  if (!ui) throw new Error("useCartUI must be used inside <CartProvider>");
  return ui;
}

export function useCart() {
  const lines: CartLine[] = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getServerSnapshot);
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const total = lines.reduce((n, l) => n + l.qty * l.price_ils, 0);
  return { lines, count, total, ...cartStore };
}
