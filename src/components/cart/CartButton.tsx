"use client";

import { useCart, useCartUI } from "@/components/cart/CartContext";
import { BrandMark } from "@/components/brand/BrandMark";
import styles from "@/components/SiteHeader.module.css";

/** The logo's bottle (adli-bottle-icon-mono.svg) as the cart. The badge re-mounts on every change, so it pulses once. */
export function CartButton() {
  const { count } = useCart();
  const { openSheet } = useCartUI();

  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={`سلة الطلب: ${count}`}
      aria-haspopup="dialog"
      onClick={openSheet}
      data-cart-target
    >
      <BrandMark kind="bottle" tone="mono" height={26} />
      <span key={count} className={`${styles.badge} ${count > 0 ? styles.pulse : ""}`} aria-hidden="true">
        {count}
      </span>
    </button>
  );
}
