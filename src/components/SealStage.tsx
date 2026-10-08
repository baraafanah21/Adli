import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AddToOrderButton } from "@/components/cart/AddToOrderButton";
import { BrandMark } from "@/components/brand/BrandMark";
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
  /** Product page: one quiet line under the purchase block. */
  after?: ReactNode;
};

/**
 * The product card: the photo filling a 4:5 frame (brass hairline, the logo seal as a corner badge), then name,
 * meta, price and «أضف للطلب». A product with options (size, colour) is chosen on its page, so the card links there.
 * Cards load the small photo (480×600), the product page the large one (1600px).
 */
export function SealStage({ product, categoryName, size = "md", preload, children, purchase, after }: Props) {
  const href = `/p/${product.slug}`;
  const isOut = product.stock_state === "out";
  const lg = size === "lg";
  const src = productImageSrc(product.image_path, lg ? "lg" : "sm");

  const photo = src ? (
    <>
      <Image
        src={src}
        alt={lg ? product.name_ar : ""}
        fill
        sizes={lg ? "(max-width: 840px) calc(100vw - 32px), 440px" : "(max-width: 599px) 46vw, 248px"}
        // Cards load the 480×600 .sm.webp as it is (no Vercel transformation); the product page's large photo is
        // resized by next/image to the frame. `preload` only for the page's LCP photo (the product page).
        unoptimized={!lg}
        preload={preload}
      />
      {/* The colour seal: its own cream backing keeps it readable on any photo (the mono one would vanish). */}
      <span className="ad-photo__seal">
        <BrandMark kind="seal" width={lg ? 40 : 32} />
      </span>
    </>
  ) : (
    <span className="ad-photo__empty">
      <BrandMark kind="seal" tone="mono" width={lg ? 96 : 56} />
    </span>
  );

  const cls = ["ad-card", lg && "ad-card--lg", !purchase && isOut && "ad-card--out"].filter(Boolean).join(" ");
  const Root = lg ? "div" : "article";
  const v = product.only_variant;

  return (
    <Root className={cls}>
      <div className="ad-photo">
        {/* Cards: the photo drifts inside the frame on scroll (motion layer); never the product page's LCP photo. */}
        <div className="ad-photo__frame" data-motion={lg ? undefined : "parallax"}>
          {lg ? (
            photo
          ) : (
            // Same destination as the name link; hidden from keyboard and screen readers so it is announced once.
            <Link href={href} tabIndex={-1} aria-hidden="true">
              {photo}
            </Link>
          )}
        </div>
        {!lg && product.stock_state === "low" && <span className="ad-tag">كمية محدودة</span>}
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
        {after && <p className="ad-card__after">{after}</p>}
      </div>
    </Root>
  );
}
