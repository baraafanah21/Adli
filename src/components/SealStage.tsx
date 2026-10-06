import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AddToOrderButton } from "@/components/cart/AddToOrderButton";
import { formatPrice, joinAnd, metaLine, productImageSrc } from "@/lib/format";
import type { ProductCard } from "@/lib/catalog";

export type SealStageProduct = Pick<
  ProductCard,
  "slug" | "name_ar" | "family_ar" | "volume_ml" | "image_path" | "price_ils" | "price_varies" | "stock_state" | "only_variant" | "option_names"
>;

type Props = {
  product: SealStageProduct;
  categoryName?: string;
  /** "lg" is the product page: h1 name, no link, room for a description. */
  size?: "md" | "lg";
  /** Preload the image (above the fold). */
  preload?: boolean;
  /** Extra content under the meta line (the description on the product page). */
  children?: ReactNode;
  /** Product page: replaces the price row (the variant picker owns price, availability and the button). */
  purchase?: ReactNode;
};

/**
 * The product card: the logo's double-ring seal as a turntable, then name, meta, price and «أضف للطلب».
 * A product with options (size, colour) is chosen on its page, so the card links there instead.
 */
export function SealStage({ product, categoryName, size = "md", preload, children, purchase }: Props) {
  const href = `/p/${product.slug}`;
  const src = productImageSrc(product.image_path);
  const isOut = product.stock_state === "out";
  const lg = size === "lg";

  const disc = (
    <div className="ad-seal__disc">
      {!lg && product.stock_state === "low" && <span className="ad-tag">كمية محدودة</span>}
      {src && (
        <div className="ad-seal__img">
          <Image
            src={src}
            alt={lg ? product.name_ar : ""}
            fill
            sizes={lg ? "(max-width: 840px) 70vw, 300px" : "(max-width: 600px) 30vw, 164px"}
            preload={preload}
          />
        </div>
      )}
    </div>
  );

  const cls = ["ad-card", lg && "ad-card--lg", !purchase && isOut && "ad-card--out"].filter(Boolean).join(" ");
  const Root = lg ? "div" : "article";
  const v = product.only_variant;

  return (
    <Root className={cls}>
      <div className="ad-seal">
        {lg ? (
          disc
        ) : (
          // Same destination as the name link; hidden from keyboard and screen readers so it is announced once.
          <Link href={href} tabIndex={-1} aria-hidden="true">
            {disc}
          </Link>
        )}
      </div>
      <div className="ad-card__body">
        {lg ? (
          <h1 className="ad-card__name display-md">{product.name_ar}</h1>
        ) : (
          <h3 className="ad-card__name">
            <Link href={href}>{product.name_ar}</Link>
          </h3>
        )}
        <p className="ad-card__meta">{metaLine(product.family_ar, categoryName, product.volume_ml)}</p>
        {children}
        {purchase ?? (
          <div className="ad-card__row">
            <span className="ad-price">
              {product.price_varies ? `من ${formatPrice(product.price_ils)}` : formatPrice(product.price_ils)}
            </span>
            {v ? (
              <AddToOrderButton
                outOfStock={isOut}
                product={{
                  id: v.id,
                  slug: product.slug,
                  sku: v.sku,
                  name_ar: product.name_ar,
                  variant_name_ar: v.label_ar,
                  volume_ml: product.volume_ml,
                  price_ils: v.price_ils,
                  image_path: product.image_path,
                }}
              />
            ) : isOut ? (
              <button type="button" className="ad-btn ad-btn--primary" disabled>
                نفدت الكمية
              </button>
            ) : (
              <Link className="ad-btn ad-btn--ghost" href={href}>
                اختر {joinAnd(product.option_names)}
              </Link>
            )}
          </div>
        )}
      </div>
    </Root>
  );
}
