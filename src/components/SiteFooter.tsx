import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { OpenNow } from "@/components/OpenNow";
import { SALON, hoursRows } from "@/lib/salon";
import { getWeek } from "@/lib/salon-data";
import { salonTelUrl, whatsappChatUrl } from "@/lib/whatsapp";
import styles from "./SiteFooter.module.css";

// The credit, word for word. «&» is neutral between two Arabic names, so it already sits between them in RTL;
// the RLMs (U+200F) on each side keep it there even when the line is pasted into a left-to-right context.
const CREDIT = "تصميم وبرمجة: براء عفانة ‏&‏ أحمد شنطي";

const PAGES = [
  { href: "/products", label: "المنتجات" },
  { href: "/booking", label: "احجز موعد" },
  { href: "/#location", label: "الموقع" },
  { href: "/account", label: "حسابي" },
  { href: "/privacy", label: "سياسة الخصوصية" },
];

/**
 * The public site's footer, on every page in SiteChrome (never in /admin, no admin links). Dark in both themes.
 * The full logo (adli-logo-mono.svg) large in cream, then four columns: hours (salon_hours, «مفتوح الآن»), location,
 * contact, pages; the credit line at the very bottom. On wide screens it sits behind the page (sticky bottom) so the
 * content rises off it at the end (SiteChrome); where it is taller than the screen it is an ordinary block. Reads only
 * cached salon data (getWeek), never the session.
 */
export async function SiteFooter() {
  const week = await getWeek();
  const place = SALON.address ?? SALON.city;

  return (
    <footer className={styles.footer} data-theme="night">
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Link href="/" className={styles.logo} aria-label="عدلي، الصفحة الرئيسية">
            <BrandMark kind="logo" tone="mono" width={200} />
          </Link>
          {/* The salon's name as search engines get it (src/lib/seo.ts), the same spelling. */}
          <p className={styles.tagline}>
            {SALON.name} ({SALON.owner}) للحلاقة الرجالية والعطور في {SALON.city}
          </p>
        </div>

        <div className={styles.columns}>
          <section aria-labelledby="footer-hours">
            <h2 id="footer-hours" className={styles.heading}>
              الدوام
            </h2>
            {week ? (
              <>
                <OpenNow week={week} />
                <dl className={styles.hours}>
                  {hoursRows(week).map((h) => (
                    <div key={h.days}>
                      <dt>{h.days}</dt>
                      <dd>{h.hours}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className={styles.muted}>ساعات الدوام غير متاحة الآن.</p>
            )}
          </section>

          <section aria-labelledby="footer-place">
            <h2 id="footer-place" className={styles.heading}>
              الموقع
            </h2>
            <p className={styles.text}>{place}</p>
            <ul className={styles.links}>
              {SALON.mapUrl && (
                <li>
                  <a href={SALON.mapUrl} target="_blank" rel="noopener noreferrer">
                    افتح في خرائط جوجل
                  </a>
                </li>
              )}
            </ul>
          </section>

          <section aria-labelledby="footer-contact">
            <h2 id="footer-contact" className={styles.heading}>
              تواصل
            </h2>
            <ul className={styles.links}>
              <li>
                <a href={whatsappChatUrl()} target="_blank" rel="noopener noreferrer">
                  واتساب
                </a>
              </li>
              <li>
                <a href={salonTelUrl()}>اتصل بالصالون</a>
              </li>
              {SALON.instagram && (
                <li>
                  <a href={SALON.instagram} target="_blank" rel="noopener noreferrer">
                    إنستغرام
                  </a>
                </li>
              )}
            </ul>
          </section>

          <nav aria-labelledby="footer-pages">
            <h2 id="footer-pages" className={styles.heading}>
              الصفحات
            </h2>
            <ul className={styles.links}>
              {PAGES.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className={styles.base}>
          <p>© {SALON.name}، {SALON.city}</p>
          <p dir="rtl" className={styles.credit}>
            {CREDIT}
          </p>
        </div>
      </div>
    </footer>
  );
}
