import Link from "next/link";
import type { ReactNode } from "react";
import { SealStage } from "@/components/SealStage";
import { Button } from "@/components/Button";
import { BundleContents } from "@/components/BundleContents";
import { ArrowBackIcon } from "@/components/icons";
import type { ProductDetail } from "@/lib/catalog";
import styles from "./ProductView.module.css";

/** The first in stock, otherwise the first: the variant a product page opens on (?v=sku is applied on the client). */
export const initialVariant = (product: ProductDetail) =>
  product.variants.find((v) => v.stock_state !== "out") ?? product.variants[0];

/**
 * A product page's content: back link, the large frame, description, bundle contents and the purchase block.
 * Used by the shop (/p/[slug], cached, active products only) and by the admin preview
 * (/admin/products/[id]/preview, hidden products too), so the owner sees exactly what customers will see.
 */
export function ProductView({ product, purchase, note }: { product: ProductDetail; purchase: ReactNode; note?: ReactNode }) {
  const category = product.category;
  const initial = initialVariant(product);
  return (
    <main className={styles.page}>
      <Link className={styles.back} href={category ? `/c/${category.slug}` : "/#shelf"}>
        <ArrowBackIcon />
        {category ? category.name_ar : "كل المنتجات"}
      </Link>
      {note && (
        <p className={styles.hidden} role="note">
          {note}
        </p>
      )}
      <SealStage
        product={{ ...product, only_variant: null, option_names: product.options.map((o) => o.name_ar) }}
        categoryName={category?.name_ar}
        size="lg"
        preload
        purchase={purchase}
      >
        {product.description_ar && <p className={`body-lg ${styles.description}`}>{product.description_ar}</p>}
        {product.bundle && <BundleContents lines={product.bundle} bundlePrice={initial?.price_ils ?? product.price_ils} />}
      </SealStage>
    </main>
  );
}

/** «تعذّر تحميل المنتج الآن» with a retry link. */
export function ProductUnavailable({ href }: { href: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.error} role="alert">
        <p className="body">تعذّر تحميل المنتج الآن. حاول مرة أخرى بعد قليل.</p>
        <Button variant="ghost" href={href}>
          أعد المحاولة
        </Button>
      </div>
    </main>
  );
}
