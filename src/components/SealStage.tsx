import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { formatPrice, metaLine, productImageSrc } from "@/lib/format";
import type { StockStatus } from "@/lib/catalog";

export type SealStageProduct = {
  slug: string;
  name_ar: string;
  family_ar: string | null;
  price_ils: number;
  volume_ml: number | null;
  image_path: string | null;
  stock_status: StockStatus;
};

type Props = {
  product: SealStageProduct;
  categoryName?: string;
  /** "lg" is the product page: h1 name, no link, room for a description. */
  size?: "md" | "lg";
  /** Load the image eagerly (above the fold). */
  priority?: boolean;
  /** Extra content under the meta line (the description on the product page). */
  children?: ReactNode;
};

/**
 * The product card: the logo's double-ring seal as a turntable, then name, meta, price and «أضف للطلب».
 * The disc holds the fallback image now; Phase 3 puts the drei <View> in the same place.
 */
export function SealStage({ product, categoryName, size = "md", priority, children }: Props) {
  const href = `/p/${product.slug}`;
  const src = productImageSrc(product.image_path);
  const isOut = product.stock_status === "out";
  const lg = size === "lg";

  const disc = (
    <div className="ad-seal__disc">
      {product.stock_status === "low" && <span className="ad-tag">كمية محدودة</span>}
      {src && (
        <div className="ad-seal__img">
          <Image
            src={src}
            alt={lg ? product.name_ar : ""}
            fill
            sizes={lg ? "(max-width: 840px) 70vw, 300px" : "(max-width: 600px) 30vw, 164px"}
            priority={priority}
          />
        </div>
      )}
    </div>
  );

  const cls = ["ad-card", lg && "ad-card--lg", isOut && "ad-card--out"].filter(Boolean).join(" ");
  const Root = lg ? "div" : "article";

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
        <div className="ad-card__row">
          <span className="ad-price">{formatPrice(product.price_ils)}</span>
          {/* No-op until the cart lands in Phase 2. */}
          <Button variant="primary" disabled={isOut}>
            {isOut ? "نفدت الكمية" : "أضف للطلب"}
          </Button>
        </div>
      </div>
    </Root>
  );
}
