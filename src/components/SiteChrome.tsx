import { Suspense, type ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { CartProvider } from "@/components/cart/CartContext";
import { SmoothScroll } from "@/components/SmoothScroll";
import { SessionIsland } from "@/components/session/SessionIsland";

/**
 * The public site's frame: smooth scroll, the cart (and its order sheet) and the header.
 * Used by the (site) layout and by the root not-found page, which renders outside any route group.
 * /admin has its own frame and doesn't use this. It never reads the session itself: <SessionIsland> does,
 * behind its own boundary, and the account menu, order sheet and booking form pick it up on the client.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <SmoothScroll />
      <Suspense fallback={null}>
        <SessionIsland />
      </Suspense>
      <CartProvider>
        <SiteHeader />
        {children}
      </CartProvider>
    </>
  );
}
