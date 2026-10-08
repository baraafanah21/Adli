import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { formatWhen } from "@/lib/bookings";
import { CUSTOMER_FILTERS, customerName, formatShortDate, isCustomerFilter, type CustomerList } from "@/lib/admin/customers";
import list from "../products/products.module.css";
import styles from "./customers.module.css";

export const metadata: Metadata = { title: "الزبائن" };

const PAGE = 50;

/**
 * «الزبائن» (E3.2): every account that isn't staff. Staff see everyone and act on the booking limit and the note; the
 * owner also sees what each customer spent, and blocks. Guest orders (no account) aren't here: one number isn't one
 * person, and nothing on this page could act on them. They stay in «الطلبات», searchable by number.
 */
export default async function AdminCustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requireRole(["owner", "staff"], "/admin/customers");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const q = (one("q") ?? "").trim().slice(0, 80);
  const filter = isCustomerFilter(one("filter")) ? one("filter")! : null;
  const page = Math.max(1, Number.parseInt(one("page") ?? "1", 10) || 1);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_customers", {
    p_q: q || null,
    p_filter: filter,
    p_limit: PAGE,
    p_offset: (page - 1) * PAGE,
  });
  if (error) console.error("admin customers", error.code, error.message);
  const res = data as CustomerList | null;
  const rows = res?.rows ?? [];
  const pages = Math.max(1, Math.ceil((res?.total ?? 0) / PAGE));

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: q || null, filter, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/customers?${s}` : "/admin/customers";
  };

  return (
    <main className={list.page}>
      <div className={list.head}>
        <h1 className="title">الزبائن</h1>
        {res && <span className={styles.muted}>{res.total}</span>}
      </div>

      <form className={list.filters} action="/admin/customers" role="search">
        {filter && <input type="hidden" name="filter" value={filter} />}
        <div className="ad-field">
          <label htmlFor="customers-q">بحث</label>
          <input id="customers-q" name="q" type="search" defaultValue={q} placeholder="الاسم أو الرقم أو الإيميل" maxLength={80} />
        </div>
        <div className={list.filterActions}>
          <button type="submit" className="ad-btn ad-btn--primary">
            بحث
          </button>
          {(q || filter) && (
            <Link className="ad-btn ad-btn--ghost" href="/admin/customers">
              مسح
            </Link>
          )}
        </div>
      </form>

      <nav className={`ad-chips ${list.chips}`} aria-label="تصفية">
        <Link className="ad-chip" href={href({ filter: null, page: null })} aria-current={filter === null ? "page" : undefined}>
          الكل
        </Link>
        {CUSTOMER_FILTERS.map((f) => (
          <Link
            key={f.key}
            className="ad-chip"
            href={href({ filter: f.key, page: null })}
            aria-current={filter === f.key ? "page" : undefined}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {error || !res ? (
        <p className="ad-notice ad-notice--error" role="alert">
          تعذّر تحميل الزبائن. حدّث الصفحة بعد قليل.
        </p>
      ) : rows.length === 0 ? (
        <p className={list.empty} role="status">
          {q || filter ? "لا زبائن بهذه الشروط. غيّر البحث أو اضغط «مسح»." : "لا زبائن بحسابات بعد."}
        </p>
      ) : (
        <ul className={list.list}>
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/customers/${c.id}`} className={list.row}>
                <span className={list.main}>
                  <span className={list.name}>{customerName(c)}</span>
                  <span className={list.meta} dir="auto">
                    {c.phone ? <bdi dir="ltr">{c.phone}</bdi> : "بلا رقم"} · منذ {formatShortDate(c.joined_at)}
                  </span>
                  <span className={styles.counts}>
                    حضر {c.attended} · لم يحضر {c.no_show} · ملغى {c.cancelled} · طلبات {c.orders}
                    {c.last_visit ? ` · آخر زيارة ${formatShortDate(c.last_visit)}` : ""}
                  </span>
                  {c.next_booking && <span className={styles.counts}>القادم: {formatWhen(c.next_booking.starts_at)}</span>}
                  {(c.blocked || c.flagged || c.rate_limited) && (
                    <span className={styles.badges}>
                      {c.blocked && (
                        <span className={styles.badge} data-tone="blocked">
                          محظور
                        </span>
                      )}
                      {c.flagged && (
                        <span className={styles.badge} data-tone="flag">
                          تخلّف عن موعد
                        </span>
                      )}
                      {c.rate_limited && <span className={styles.badge}>وصل حد المحاولات</span>}
                    </span>
                  )}
                </span>
                {res.owner && c.spent_ils !== null && (
                  <span className={list.side}>
                    <span className={list.price}>{formatPrice(c.spent_ils)}</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className={styles.pager} aria-label="الصفحات">
          {page > 1 ? (
            <Link className="ad-btn ad-btn--ghost" href={href({ page: String(page - 1) })}>
              السابق
            </Link>
          ) : (
            <span />
          )}
          <span className={styles.muted}>
            صفحة {page} من {pages}
          </span>
          {page < pages ? (
            <Link className="ad-btn ad-btn--ghost" href={href({ page: String(page + 1) })}>
              التالي
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
