"use client";

import { useState } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import styles from "./SalonLocation.module.css";

/**
 * The salon's map, light until asked for: a still image (or a plain card) first, and the Google Maps iframe only once
 * the visitor taps it. Nothing from Google loads before that (no script, no cookies, no weight on the page).
 */
export function MapOnTap({ lat, lng, image, label }: { lat: number; lng: number; image: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  const src = `https://www.google.com/maps?q=${lat},${lng}&z=17&hl=ar&output=embed`;

  if (open) {
    return (
      <div className={styles.map}>
        <iframe className={styles.mapFrame} src={src} title={`خريطة: ${label}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
      </div>
    );
  }

  return (
    <button type="button" className={`${styles.map} ${styles.mapStill}`} onClick={() => setOpen(true)}>
      {image ? (
        // A small still from public/salon/, as it is.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.mapImage} src={image} alt="" loading="lazy" decoding="async" />
      ) : (
        <BrandMark kind="seal" tone="mono" width={72} className={styles.mapMark} />
      )}
      <span className={styles.mapCta}>اعرض الخريطة</span>
    </button>
  );
}
