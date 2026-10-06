"use client";

import { useCart, useCartUI } from "@/components/cart/CartContext";
import { BottleIcon } from "@/components/icons";
import styles from "@/components/SiteHeader.module.css";

/** The logo's bottle as the cart. The badge re-mounts on every change, so it pulses once. */
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
      <BottleIcon size={26} />
      <span key={count} className={`${styles.badge} ${count > 0 ? styles.pulse : ""}`} aria-hidden="true">
        {count}
      </span>
    </button>
  );
}
