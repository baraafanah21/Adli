import { BrandMark } from "@/components/brand/BrandMark";
import { getServices } from "@/lib/salon-data";
import styles from "./ServicesMarquee.module.css";

/**
 * The services in brass, sliding by without end above the footer (CSS only). It pauses under the pointer or keyboard
 * focus, and stands still with reduced motion (then it is a row that wraps). Read from the cached salon data.
 * The list is written twice for the seamless loop; the copy is hidden from screen readers.
 */
export async function ServicesMarquee() {
  const services = await getServices();
  if (!services?.length) return null;
  const names = services.map((s) => s.name_ar);

  const run = (copy: boolean) => (
    <ul className={styles.run} aria-hidden={copy || undefined}>
      {names.map((n, i) => (
        <li key={`${n}-${i}`}>
          <span>{n}</span>
          <BrandMark kind="seal" tone="mono" width={20} className={styles.sep} />
        </li>
      ))}
    </ul>
  );

  return (
    <section className={styles.marquee} aria-label="خدمات الصالون">
      <div className={styles.track}>
        {run(false)}
        {run(true)}
      </div>
    </section>
  );
}
