import styles from "./SealMark.module.css";

/** The logo seal in CSS: cream ring, forest ring, cream hairline, the letter ع. Decorative. */
export function SealMark({ size = "lg" }: { size?: "sm" | "lg" }) {
  return (
    <span className={`${styles.seal} ${styles[size]}`} aria-hidden="true">
      <span className={styles.ring}>
        <span className={styles.disc}>
          <span className={styles.letter}>ع</span>
        </span>
      </span>
    </span>
  );
}
