import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { OpenNow } from "@/components/OpenNow";
import { SALON, hoursRows } from "@/lib/salon";
import { getWeek } from "@/lib/salon-data";
import { whatsappChatUrl } from "@/lib/whatsapp";
import styles from "./SiteFooter.module.css";

// The credit, word for word. «&» is neutral between two Arabic names, so it already sits between them in RTL;
// the RLMs (U+200F) on each side keep it there even when the line is pasted into a left-to-right context.
const CREDIT = "تصميم وبرمجة: براء عفانة ‏&‏ أحمد شنطي";

/**
 * The public site's footer, on every page in SiteChrome (never in /admin, which has its own frame).
 * Dark in both themes, like the hero. Reads only cached salon data (getWeek), never the session.
 */
export async function SiteFooter() {
  const week = await getWeek();

  return (
    <footer className={styles.footer} data-theme="night">
      <div className={styles.inner}>
        <Link href="/" className={styles.logo} aria-label="عدلي، الصفحة الرئيسية">
          <BrandMark kind="logo" tone="mono" width={136} />
        </Link>

        <div className={styles.columns}>
          <section aria-labelledby="footer-salon">
            <h2 id="footer-salon" className={styles.heading}>
              الصالون
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
            {SALON.address && <p className={styles.muted}>{SALON.address}</p>}
          </section>

          <nav aria-labelledby="footer-browse">
            <h2 id="footer-browse" className={styles.heading}>
              تصفّح
            </h2>
            <ul className={styles.links}>
              <li>
                <Link href="/#shelf">المنتجات</Link>
              </li>
              <li>
                <Link href="/booking">احجز موعد</Link>
              </li>
              <li>
                <Link href="/account">حسابي</Link>
              </li>
            </ul>
          </nav>

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
              {SALON.mapUrl && (
                <li>
                  <a href={SALON.mapUrl} target="_blank" rel="noopener noreferrer">
                    الخريطة
                  </a>
                </li>
              )}
            </ul>
          </section>
        </div>

        <div className={styles.base}>
          <p>© عدلي</p>
          <p dir="rtl" className={styles.credit}>
            {CREDIT}
          </p>
        </div>
      </div>
    </footer>
  );
}
