"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import { signOut } from "@/app/(site)/auth/actions";
import { SealMark } from "@/components/SealMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BottleIcon, BoxIcon, CalendarIcon, GridIcon, HomeIcon, MoreIcon, ReceiptIcon, ScissorsIcon, UserIcon, UsersIcon } from "@/components/icons";
import styles from "@/app/admin/admin.module.css";

/**
 * `bar`: on the phone's bottom bar; the rest go into «المزيد».
 * `badges`: counts beside the label, each with what it counts (read out in the link's label); `muted` is outlined.
 */
type Badge = { n: number; what: string; muted?: boolean };
type Item = { href: string; label: string; icon: ComponentType<{ size?: number }>; badges?: Badge[]; bar?: boolean };
type Props = { role: "owner" | "staff"; newOrders: number; newBookings: number; pendingBookings: number };

/**
 * Desktop (≥ 900px): a sidebar at the inline start with every section, «عرض الموقع», the theme and «خروج».
 * Phones: a bottom bar with the four daily sections (the barber's calendar among them) and «المزيد» (products, owner
 * sections, the site, the theme, sign out).
 * The owner-only sections are hidden from staff here, and refused by requireRole() and the database anyway.
 */
export function AdminNav({ role, newOrders, newBookings, pendingBookings }: Props) {
  const pathname = usePathname();
  const main: Item[] = [
    { href: "/admin", label: "الرئيسية", icon: HomeIcon, bar: true },
    {
      href: "/admin/bookings",
      label: "المواعيد",
      icon: CalendarIcon,
      // New since this person last opened «المواعيد» (brass), and waiting for the salon to confirm (outlined).
      badges: [
        { n: newBookings, what: "جديد" },
        { n: pendingBookings, what: "بانتظار التأكيد", muted: true },
      ],
      bar: true,
    },
    { href: "/admin/orders", label: "الطلبات", icon: ReceiptIcon, badges: [{ n: newOrders, what: "جديد" }], bar: true },
    // E3.2: every staff member; on the phone it sits in «المزيد».
    { href: "/admin/customers", label: "الزبائن", icon: UserIcon },
    { href: "/admin/products", label: "المنتجات", icon: BottleIcon },
    { href: "/admin/stock", label: "المخزون", icon: BoxIcon, bar: true },
  ];
  const ownerOnly: Item[] =
    role === "owner"
      ? [
          { href: "/admin/salon", label: "الصالون", icon: ScissorsIcon },
          { href: "/admin/categories", label: "الفئات", icon: GridIcon },
          { href: "/admin/staff", label: "الطاقم", icon: UsersIcon },
        ]
      : [];

  const isCurrent = (href: string) => (href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const link = (item: Item, cls: string, onClick?: () => void) => {
    const shown = (item.badges ?? []).filter((b) => b.n > 0);
    return (
    <Link
      key={item.href}
      href={item.href}
      className={cls}
      aria-current={isCurrent(item.href) ? "page" : undefined}
      onClick={onClick}
      aria-label={shown.length ? [item.label, ...shown.map((b) => `${b.n} ${b.what}`)].join("، ") : undefined}
    >
      <item.icon />
      <span>{item.label}</span>
      {shown.map((b) => (
        <span key={b.what} className={b.muted ? `${styles.badge} ${styles.badgeMuted}` : styles.badge} aria-hidden="true">
          {b.n}
        </span>
      ))}
    </Link>
    );
  };

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
        {main.filter((i) => i.bar).map((i) => link(i, styles.barLink))}
        <MoreMenu
          items={[...main.filter((i) => !i.bar), ...ownerOnly]}
          current={[...main.filter((i) => !i.bar), ...ownerOnly].some((i) => isCurrent(i.href))}
          renderLink={link}
        />
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
