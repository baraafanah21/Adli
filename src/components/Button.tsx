import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "whatsapp" | "ghost";

type Common = { variant?: Variant; block?: boolean; className?: string; children: ReactNode };
type AsButton = Common & Omit<ComponentProps<"button">, "className" | "children"> & { href?: undefined };
type AsLink = Common & Omit<ComponentProps<typeof Link>, "className" | "children">;

/** `ad-btn` from the design system. Renders a Next <Link> when given `href`. */
export function Button(props: AsButton | AsLink) {
  const { variant = "primary", block, className, children, ...rest } = props;
  const cls = ["ad-btn", `ad-btn--${variant}`, block && "ad-btn--block", className].filter(Boolean).join(" ");

  if ("href" in rest && rest.href !== undefined) {
    return (
      <Link className={cls} {...(rest as Omit<AsLink, keyof Common>)}>
        {children}
      </Link>
    );
  }
  const { type = "button", ...buttonRest } = rest as Omit<AsButton, keyof Common>;
  return (
    <button type={type} className={cls} {...buttonRest}>
      {children}
    </button>
  );
}
