"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { cartStore, type CartLine } from "@/lib/cart-store";
import { OrderSheet } from "@/components/cart/OrderSheet";

type CartUI = { sheetOpen: boolean; openSheet: () => void; closeSheet: () => void };

const CartUIContext = createContext<CartUI | null>(null);

/** Holds the order sheet's open state and renders the sheet once for the whole page. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const ui = useMemo(
    () => ({ sheetOpen, openSheet: () => setSheetOpen(true), closeSheet: () => setSheetOpen(false) }),
    [sheetOpen],
  );
  return (
    <CartUIContext.Provider value={ui}>
      {children}
      <OrderSheet open={sheetOpen} onClose={ui.closeSheet} />
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
