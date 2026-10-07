import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { productImageSrc } from "@/lib/format";
import { STOCK_STATE_LABEL } from "@/lib/admin/stock";
import styles from "./stock.module.css";

export const metadata: Metadata = { title: "المخزون" };

type Row = {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_label: string | null;
  sku: string;
  kind: "simple" | "bundle";
  category_name: string;
  image_path: string | null;
  stock_quantity: number;
  low_stock_threshold: number;
  stock_state: "in" | "low" | "out";
  variant_active: boolean;
  product_active: boolean;
};

export default async function AdminStockPage({ searchParams }: PageProps<"/admin/stock">) {
  await requireRole(["owner", "staff"], "/admin/stock");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const filter = one("filter") === "low" || one("filter") === "out" ? one("filter")! : null;
  const q = (one("q") ?? "").trim().slice(0, 80);
  const showHidden = one("hidden") === "1";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_stock_levels", { p_filter: filter, p_q: q || null, p_category_id: null });
  if (error) console.error("admin_stock_levels", error.code, error.message);
  const all = (data ?? []) as Row[];
  const rows = showHidden ? all : all.filter((r) => r.variant_active && r.product_active);
  const hiddenCount = all.length - all.filter((r) => r.variant_active && r.product_active).length;

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ filter, q: q || null, hidden: showHidden ? "1" : null, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/stock?${s}` : "/admin/stock";
  };

  const name = (r: Row) => (r.variant_label ? `${r.product_name} ${r.variant_label}` : r.product_name);
  const flags = (r: Row) =>
    [r.kind === "bundle" ? "بكجة: من قطعها" : null, !r.product_active ? "منتج مخفي" : !r.variant_active ? "نسخة مخفية" : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <main className={styles.page}>
      <h1 className="title">المخزون</h1>

      <nav className={`ad-chips ${styles.chips}`} aria-label="الحالة">
        <Link className="ad-chip" href={href({ filter: "low" })} aria-current={filter === "low" ? "page" : undefined}>
          تحت حد الإنذار
        </Link>
        <Link className="ad-chip" href={href({ filter: "out" })} aria-current={filter === "out" ? "page" : undefined}>
          نفد
        </Link>
        <Link className="ad-chip" href={href({ filter: null })} aria-current={filter === null ? "page" : undefined}>
          الكل
        </Link>
      </nav>

      <form className={styles.filters} action="/admin/stock" role="search">
        {filter && <input type="hidden" name="filter" value={filter} />}
        {showHidden && <input type="hidden" name="hidden" value="1" />}
        <div className="ad-field">
          <label htmlFor="stock-q">بحث</label>
          <input id="stock-q" name="q" type="search" defaultValue={q} placeholder="اسم المنتج أو SKU" maxLength={80} />
        </div>
        <button type="submit" className="ad-btn ad-btn--primary">
          بحث
        </button>
      </form>

      {error ? (
        <p className="ad-notice ad-notice--error" role="alert">
          تعذّر تحميل المخزون. حدّث الصفحة بعد قليل.
        </p>
      ) : rows.length === 0 ? (
        <p className={styles.empty} role="status">
          {filter === "low" ? "لا شيء تحت حد الإنذار. كل المنتجات الظاهرة فيها ما يكفي." : filter === "out" ? "لا منتج ظاهر نفد." : "لا نتائج."}
        </p>
      ) : (
        <>
          {/* Desktop */}
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">المنتج</th>
                <th scope="col">SKU</th>
                <th scope="col">الكمية</th>
                <th scope="col">الحالة</th>
                <th scope="col">حد الإنذار</th>
                <th scope="col">
                  <span className="sr-only">تعديل</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.variant_id}>
                  <th scope="row">
                    <span className={styles.product}>
                      <Thumb path={r.image_path} />
                      <span>
                        {name(r)}
                        {flags(r) && <span className={styles.flag}>{flags(r)}</span>}
                      </span>
                    </span>
                  </th>
                  <td dir="ltr" className={styles.sku}>
                    {r.sku}
                  </td>
                  <td className={styles.qty}>{r.stock_quantity}</td>
                  <td>
                    <span className="ad-stock-state" data-state={r.stock_state}>
                      {STOCK_STATE_LABEL[r.stock_state]}
                    </span>
                  </td>
                  <td className={styles.num}>{r.kind === "bundle" ? "—" : r.low_stock_threshold}</td>
                  <td>
                    {r.kind === "bundle" ? (
                      <Link className={styles.edit} href={`/admin/products/${r.product_id}`}>
                        القطع
                      </Link>
                    ) : (
                      <Link className={styles.edit} href={`/admin/stock/${r.variant_id}`} aria-label={`تعديل مخزون ${name(r)}`}>
                        تعديل
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Phones */}
          <ul className={styles.cards}>
            {rows.map((r) => (
              <li key={r.variant_id}>
                <Link
                  className={styles.card}
                  href={r.kind === "bundle" ? `/admin/products/${r.product_id}` : `/admin/stock/${r.variant_id}`}
                >
                  <Thumb path={r.image_path} />
                  <span className={styles.cardMain}>
                    <span className={styles.cardName}>{name(r)}</span>
                    <span className={styles.flag}>{flags(r) || r.sku}</span>
                  </span>
                  <span className={styles.cardSide}>
                    <span className={styles.qty}>{r.stock_quantity}</span>
                    <span className="ad-stock-state" data-state={r.stock_state}>
                      {STOCK_STATE_LABEL[r.stock_state]}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {hiddenCount > 0 && (
        <Link className={styles.toggle} href={href({ hidden: showHidden ? null : "1" })}>
          {showHidden ? "أخفِ المنتجات والنسخ المخفية" : `أظهر المخفي أيضاً (${hiddenCount})`}
        </Link>
      )}
    </main>
  );
}

function Thumb({ path }: { path: string | null }) {
  const src = productImageSrc(path, "sm");
  return (
    <span className={styles.thumb} aria-hidden="true">
      {src && <Image src={src} alt="" fill sizes="40px" unoptimized />}
    </span>
  );
}
