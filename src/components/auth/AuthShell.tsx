import type { ReactNode } from "react";
import { SealMark } from "@/components/SealMark";
import styles from "./auth.module.css";

/** The frame for sign-in, sign-up and password pages: small seal, title, one short line, the form. */
export function AuthShell({ title, lede, children, footer }: { title: string; lede?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="auth-title">
        <div className={styles.seal}>
          <SealMark size="sm" />
        </div>
        <h1 id="auth-title" className="title">
          {title}
        </h1>
        {lede && <p className={styles.lede}>{lede}</p>}
        {children}
        {footer && <div className={styles.footer}>{footer}</div>}
      </section>
    </main>
  );
}
