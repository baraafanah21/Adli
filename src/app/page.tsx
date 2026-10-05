import styles from "./page.module.css";

/*
  Phase 0 placeholder. Phase 1 replaces this with the 3D seal scene
  (see docs/ROADMAP.md). Kept on-brand so the first Vercel deploy is presentable.
*/
export default function Home() {
  return (
    <main className={styles.hero}>
      <div className={styles.seal} aria-hidden="true">
        <div className={styles.ring}>
          <div className={styles.disc}>
            <span className={styles.letter}>ع</span>
          </div>
        </div>
      </div>
      <h1 className="display-xl">عدلي</h1>
      <p className="latin-mark">ADLI</p>
      <p className="body-lg" style={{ color: "var(--ink-muted)", maxWidth: "32ch", textAlign: "center" }}>
        صالون حلاقة، وعطور وكريمات. الموقع قيد التجهيز.
      </p>
    </main>
  );
}
