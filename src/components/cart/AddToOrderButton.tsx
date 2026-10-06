"use client";

import { useRef, useState, type MouseEvent } from "react";
import { cartStore, type CartLine } from "@/lib/cart-store";

type Props = { product: Omit<CartLine, "qty">; outOfStock?: boolean };

/**
 * A small copy of the product image flies in an arc to the bottle icon in the header (600ms).
 * Positioned from the inline-start edge so it stays logical in RTL. Skipped under reduced motion.
 */
function flyToCart(from: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const img = from.closest(".ad-card")?.querySelector<HTMLImageElement>(".ad-seal__img img");
  const target = document.querySelector<HTMLElement>("[data-cart-target]");
  if (!img || !target || typeof img.animate !== "function") return;

  const a = img.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const size = Math.min(a.width, a.height, 160);

  const clone = img.cloneNode(true) as HTMLImageElement;
  clone.removeAttribute("srcset");
  clone.src = img.currentSrc || img.src;
  clone.alt = "";
  Object.assign(clone.style, {
    position: "fixed",
    insetBlockStart: "0",
    insetInlineStart: "0", // the right edge in RTL; x below is measured from it
    width: `${size}px`,
    height: `${size}px`,
    objectFit: "contain",
    pointerEvents: "none",
    zIndex: "var(--z-sheet)",
  });
  document.body.appendChild(clone);

  // Translate the clone's right edge (inline-start in RTL) from the image centre to the bottle centre.
  const x0 = a.left + a.width / 2 + size / 2 - vw;
  const y0 = a.top + a.height / 2 - size / 2;
  const x1 = b.left + b.width / 2 + size / 2 - vw;
  const y1 = b.top + b.height / 2 - size / 2;
  const lift = Math.min(160, Math.abs(y1 - y0) / 2 + 60);

  const anim = clone.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - lift}px) scale(0.55)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) scale(0.12)`, opacity: 0.4 },
    ],
    { duration: 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
  anim.onfinish = anim.oncancel = () => clone.remove();
}

/** «أضف للطلب» → «أُضيف للطلب» for 1.5s. Same action name through the whole flow (brand book). */
export function AddToOrderButton({ product, outOfStock }: Props) {
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  if (outOfStock) {
    return (
      <button type="button" className="ad-btn ad-btn--primary" disabled>
        نفدت الكمية
      </button>
    );
  }

  function add(e: MouseEvent<HTMLButtonElement>) {
    flyToCart(e.currentTarget);
    cartStore.add(product);
    setAdded(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1500);
  }

  return (
    <>
      <button type="button" className="ad-btn ad-btn--primary" onClick={add}>
        {added ? "أُضيف للطلب" : "أضف للطلب"}
      </button>
      <span className="sr-only" role="status">
        {added ? `أُضيف ${product.name_ar} للطلب` : ""}
      </span>
    </>
  );
}
