import type { ReactNode } from "react";
import { CategoryIcon } from "@/components/icons";
import styles from "./ComingSoon.module.css";

type Props = {
  category: { name_ar: string; icon: string | null; description_ar: string | null };
  /** Fits the page outline: h3 under the shelf's h2, h2 under the category page's h1. */
  headingLevel?: "h2" | "h3";
  children?: ReactNode;
};

/** An active category with no products yet: the category's icon on an empty seal, «قريباً», and its description. */
export function ComingSoon({ category, headingLevel: H = "h3", children }: Props) {
  return (
    <div className={styles.soon} role="status">
      <div className={styles.seal} aria-hidden="true">
        <CategoryIcon name={category.icon} size={40} />
      </div>
      <H className={styles.title}>قريباً في {category.name_ar}</H>
      {category.description_ar && <p className={styles.text}>{category.description_ar}</p>}
      {children}
    </div>
  );
}
