import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { CartProvider } from "@/components/cart/CartContext";
import { SmoothScroll } from "@/components/SmoothScroll";
import { getCurrentUser, getProfile } from "@/lib/auth/guards";

/**
 * The public site's frame: smooth scroll, the cart (and its order sheet) and the header.
 * Used by the (site) layout and by the root not-found page, which renders outside any route group.
 * /admin has its own frame and doesn't use this.
 */
export async function SiteChrome({ children }: { children: ReactNode }) {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  return (
    <>
      <SmoothScroll />
      <CartProvider userId={user?.id ?? null} prefill={profile}>
        <SiteHeader />
        {children}
      </CartProvider>
    </>
  );
}
