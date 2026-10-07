"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AddToOrderButton } from "@/components/cart/AddToOrderButton";
import { VariantPicker } from "@/components/VariantPicker";
import { formatPrice } from "@/lib/format";
import type { ProductOption, Variant } from "@/lib/catalog";

type Props = {
  product: { slug: string; name_ar: string; volume_ml: number | null; image_path: string | null };
  options: ProductOption[];
  variants: Variant[];
  /** The first in-stock variant (from the server); ProductPurchaseFromUrl swaps in ?v=sku on the client. */
  initialSku: string;
};

/** The product page's price row: the variant picker (when there is a choice), the price, availability and «أضف للطلب». */
export function ProductPurchase({ product, options, variants, initialSku }: Props) {
  const [selected, setSelected] = useState(() => variants.find((v) => v.sku === initialSku) ?? variants[0]);

  function select(v: Variant) {
    setSelected(v);
    // The choice lives in the URL (?v=sku) so it can be shared; no navigation, no new server render.
    const url = new URL(window.location.href);
    url.searchParams.set("v", v.sku);
    window.history.replaceState(null, "", url);
  }

  if (!selected) {
    return (
      <div className="ad-card__row">
        <button type="button" className="ad-btn ad-btn--primary" disabled>
          نفدت الكمية
        </button>
      </div>
    );
  }

  const out = selected.stock_state === "out";
  return (
    <>
      {options.length > 0 && <VariantPicker options={options} variants={variants} selected={selected} onSelect={select} />}
      <div className="ad-card__row">
        <span className="ad-price">{formatPrice(selected.price_ils)}</span>
        <AddToOrderButton
          outOfStock={out}
          product={{
            id: selected.id,
            slug: product.slug,
            sku: selected.sku,
            name_ar: product.name_ar,
            variant_name_ar: selected.label_ar,
            volume_ml: product.volume_ml,
            price_ils: selected.price_ils,
            image_path: product.image_path,
          }}
        />
      </div>
      <p className="ad-stock" role="status">
        {selected.stock_state === "low" ? "كمية محدودة" : ""}
      </p>
    </>
  );
}

/**
 * ProductPurchase starting from ?v=sku when it names an active variant. Search params are only known per request,
 * so the product page renders this inside <Suspense> with a plain <ProductPurchase> (the default variant) as the
 * fallback, and the page itself stays the same for every URL.
 */
export function ProductPurchaseFromUrl(props: Props) {
  const v = useSearchParams().get("v");
  const sku = props.variants.some((x) => x.sku === v) ? v! : props.initialSku;
  return <ProductPurchase {...props} initialSku={sku} />;
}
