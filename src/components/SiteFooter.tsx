import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import styles from "./SiteFooter.module.css";

// The credit, word for word. «&» is neutral between two Arabic names, so it already sits between them in RTL;
// the RLMs (U+200F) on each side keep it there even when the line is pasted into a left-to-right context.
const CREDIT = "تصميم وبرمجة: براء عفانة ‏&‏ أحمد شنطي";

const LINKS = [
  { href: "/#shelf", label: "المنتجات" },
  { href: "/booking", label: "احجز موعد" },
  { href: "/#location", label: "الموقع" },
  { href: "/account", label: "حسابي" },
];

/**
 * The public site's footer, on every page in SiteChrome (never in /admin, which has its own frame; no admin links).
 * Dark in both themes. U4: the page links and the credit line, then the wordmark file (adli-wordmark-mono.svg) as
 * wide as the screen, faint, cut off at the bottom. Static: no data, no session.
 */
export function SiteFooter() {
  return (
    <footer className={styles.footer} data-theme="night">
      <div className={styles.inner}>
        <nav aria-label="روابط الموقع">
          <ul className={styles.links}>
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <p dir="rtl" className={styles.credit}>
          {CREDIT}
        </p>
      </div>
      {/* The logo file itself, never typed: decorative here (the header carries the name). */}
      <div className={styles.giant}>
        <BrandMark kind="wordmark" tone="mono" fluid className={styles.giantMark} />
      </div>
    </footer>
  );
}
