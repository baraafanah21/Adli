"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { signOut } from "@/app/(site)/auth/actions";
import { SealMark } from "@/components/SealMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BottleIcon, BoxIcon, GridIcon, HomeIcon, MoreIcon, ReceiptIcon, UsersIcon } from "@/components/icons";
import styles from "@/app/admin/admin.module.css";

type Item = { href: string; label: string; icon: ComponentType<{ size?: number }>; badge?: number };
type Props = { role: "owner" | "staff"; newOrders: number };

/**
 * Desktop (≥ 900px): a sidebar at the inline start with every section, «عرض الموقع», the theme and «خروج».
 * Phones: a bottom bar with the four daily sections and «المزيد» (owner sections, the site, the theme, sign out).
 * The owner-only sections are hidden from staff here, and refused by requireRole() and the database anyway.
 */
export function AdminNav({ role, newOrders }: Props) {
  const pathname = usePathname();
  const main: Item[] = [
    { href: "/admin", label: "الرئيسية", icon: HomeIcon },
    { href: "/admin/orders", label: "الطلبات", icon: ReceiptIcon, badge: newOrders },
    { href: "/admin/products", label: "المنتجات", icon: BottleIcon },
    { href: "/admin/stock", label: "المخزون", icon: BoxIcon },
    // Bookings track (feature/bookings): add { href: "/admin/bookings", label: "الحجوزات", icon: <calendar icon> } here.
    // On phones it goes into «المزيد» (the bar keeps four sections + المزيد); the sidebar shows it after «المخزون».
  ];
  const ownerOnly: Item[] =
    role === "owner"
      ? [
          { href: "/admin/categories", label: "الفئات", icon: GridIcon },
          { href: "/admin/staff", label: "الطاقم", icon: UsersIcon },
        ]
      : [];

  const isCurrent = (href: string) => (href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const link = (item: Item, cls: string, onClick?: () => void) => (
    <Link
      key={item.href}
      href={item.href}
      className={cls}
      aria-current={isCurrent(item.href) ? "page" : undefined}
      onClick={onClick}
      aria-label={item.badge ? `${item.label}، ${item.badge} جديد` : undefined}
    >
      <item.icon />
      <span>{item.label}</span>
      {item.badge ? (
        <span className={styles.badge} aria-hidden="true">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );

  return (
    <>
      <nav className={styles.sidebar} aria-label="لوحة الصالون">
        <Link href="/admin" className={styles.brand}>
          <SealMark size="sm" />
          <span>لوحة الصالون</span>
        </Link>
        <div className={styles.sideLinks}>
          {main.map((i) => link(i, styles.sideLink))}
          {ownerOnly.length > 0 && <hr className={styles.sideRule} />}
          {ownerOnly.map((i) => link(i, styles.sideLink))}
        </div>
        <div className={styles.sideFoot}>
          <Link href="/" className={styles.sideLink}>
            <span>عرض الموقع</span>
          </Link>
          <div className={styles.sideFootRow}>
            <ThemeToggle />
            <form action={signOut}>
              <button type="submit" className={styles.textButton}>
                خروج
              </button>
            </form>
          </div>
        </div>
      </nav>

      <nav className={styles.bottomBar} aria-label="لوحة الصالون">
        {main.map((i) => link(i, styles.barLink))}
        <MoreMenu items={ownerOnly} current={ownerOnly.some((i) => isCurrent(i.href))} renderLink={link} />
      </nav>
    </>
  );
}

function MoreMenu({
  items,
  current,
  renderLink,
}: {
  items: Item[];
  current: boolean;
  renderLink: (item: Item, cls: string, onClick?: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

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

  return (
    <div ref={root} className={styles.moreRoot}>
      <button
        ref={button}
        type="button"
        className={styles.barLink}
        aria-expanded={open}
        aria-controls={panelId}
        data-current={current || undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreIcon />
        <span>المزيد</span>
      </button>
      <div id={panelId} className={styles.morePanel} hidden={!open}>
        {items.map((i) => renderLink(i, styles.moreLink, () => setOpen(false)))}
        <Link href="/" className={styles.moreLink} onClick={() => setOpen(false)}>
          <span>عرض الموقع</span>
        </Link>
        <div className={styles.moreRow}>
          <ThemeToggle />
          <form action={signOut}>
            <button type="submit" className={styles.textButton}>
              خروج
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
