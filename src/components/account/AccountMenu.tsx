"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { UserIcon } from "@/components/icons";
import { signOut } from "@/app/(site)/auth/actions";
import styles from "@/components/SiteHeader.module.css";

type Props = { user: { name: string | null; email: string | null } | null };

/** Signed out: «دخول». Signed in: a small menu (مواعيدي، طلباتي، بياناتي، خروج). Esc and outside clicks close it. */
export function AccountMenu({ user }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (!user) {
    const next = pathname && pathname !== "/login" ? `?next=${encodeURIComponent(pathname)}` : "";
    return (
      <Link className={styles.textButton} href={`/login${next}`}>
        <UserIcon />
        <span>دخول</span>
      </Link>
    );
  }

  const label = user.name ?? user.email ?? "حسابي";
  return (
    <div className={styles.menuRoot} ref={root}>
      <button
        ref={button}
        type="button"
        className={styles.iconButton}
        aria-label={`حسابي: ${label}`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        <UserIcon />
      </button>
      {open && (
        <div id={menuId} className={styles.menu}>
          <p className={styles.menuWho}>{label}</p>
          <Link href="/account#bookings" onClick={() => setOpen(false)}>
            مواعيدي
          </Link>
          <Link href="/account/orders" onClick={() => setOpen(false)}>
            طلباتي
          </Link>
          <Link href="/account" onClick={() => setOpen(false)}>
            بياناتي
          </Link>
          <form action={signOut}>
            <button type="submit">خروج</button>
          </form>
        </div>
      )}
    </div>
  );
}
