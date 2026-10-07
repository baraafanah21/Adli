"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { cartStore, type CartLine } from "@/lib/cart-store";
import { OrderSheet } from "@/components/cart/OrderSheet";
import { useSiteSession } from "@/components/session/session-store";

type CartUI = { sheetOpen: boolean; openSheet: () => void; closeSheet: () => void };

const CartUIContext = createContext<CartUI | null>(null);

/** Holds the order sheet's open state and renders the sheet once for the whole page. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const session = useSiteSession();
  const ready = session.status === "ready" ? session : null;
  const ui = useMemo(
    () => ({ sheetOpen, openSheet: () => setSheetOpen(true), closeSheet: () => setSheetOpen(false) }),
    [sheetOpen],
  );
  return (
    <CartUIContext.Provider value={ui}>
      {children}
      {/* Re-mount when the session arrives and on sign-in/out, so the fields pick up the profile. */}
      <OrderSheet
        key={ready ? (ready.user?.id ?? "guest") : "loading"}
        open={sheetOpen}
        onClose={ui.closeSheet}
        prefill={ready?.profile ?? null}
      />
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
