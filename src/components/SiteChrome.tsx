import { Suspense, type ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ServicesMarquee } from "@/components/ServicesMarquee";
import { CartProvider } from "@/components/cart/CartContext";
import { SmoothScroll } from "@/components/SmoothScroll";
import { MotionLayer } from "@/components/motion/MotionLayer";
import { SessionIsland } from "@/components/session/SessionIsland";

/**
 * The public site's frame: smooth scroll, the motion layer (GSAP, loaded late), the cart (and its order sheet), the header and the footer.
 * Used by the (site) layout and by the root not-found page, which renders outside any route group.
 * /admin has its own frame and doesn't use this. It never reads the session itself: <SessionIsland> does,
 * behind its own boundary, and the account menu, order sheet and booking form pick it up on the client.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <SmoothScroll />
      <Suspense fallback={null}>
        <MotionLayer />
      </Suspense>
      <Suspense fallback={null}>
        <SessionIsland />
      </Suspense>
      <CartProvider>
        <SiteHeader />
        {/* The page layer: opaque, above the footer, so at the very end it rises off the footer that waits behind it.
            The services marquee closes it. */}
        <div className="ad-page">
          {children}
          <ServicesMarquee />
        </div>
        <SiteFooter />
      </CartProvider>
    </>
  );
}
