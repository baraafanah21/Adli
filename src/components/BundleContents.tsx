import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { BundleLine } from "@/lib/catalog";

type Props = { lines: BundleLine[]; bundlePrice: number };

/** What a gift bundle holds, what the pieces cost on their own, and the saving («توفّر ₪ 40»). */
export function BundleContents({ lines, bundlePrice }: Props) {
  if (lines.length === 0) return null;
  const separate = lines.reduce((sum, l) => sum + l.qty * l.unit_price_ils, 0);
  const saving = separate - bundlePrice;

  return (
    <section className="ad-bundle" aria-label="محتوى البكجة">
      <h2 className="ad-bundle__title">في البكجة</h2>
      <ul className="ad-bundle__lines">
        {lines.map((l, i) => {
          const name = l.label_ar ? `${l.name_ar} ${l.label_ar}` : l.name_ar;
          return (
            <li key={i}>
              <span>
                {l.qty > 1 && <span className="ad-bundle__qty">{l.qty} × </span>}
                {l.slug ? <Link href={`/p/${l.slug}`}>{name}</Link> : name}
              </span>
              <span className="ad-bundle__price">{formatPrice(l.qty * l.unit_price_ils)}</span>
            </li>
          );
        })}
      </ul>
      <p className="ad-bundle__sum">
        <span>قيمتها منفصلة</span>
        <s className="ad-bundle__price">{formatPrice(separate)}</s>
      </p>
      {saving > 0 && <p className="ad-bundle__saving">توفّر {formatPrice(saving)}</p>}
    </section>
  );
}
