import { keptNote } from "@/lib/storage-files";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatPrice, productImageSrc } from "@/lib/format";
import styles from "./products.module.css";

export const metadata: Metadata = { title: "المنتجات" };

type Row = {
  id: string;
  slug: string;
  name_ar: string;
  kind: "simple" | "bundle";
  price_ils: number;
  is_active: boolean;
  archived_at: string | null;
  image_path: string | null;
  category_id: string;
  product_variants: { id: string; is_active: boolean; price_ils: number | null }[];
};

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const { role } = await requireRole(["owner", "staff"], "/admin/products");
  const isOwner = role.role === "owner";
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const category = one("category") ?? null;
  const wanted = one("status");
  // «المؤرشفة» is the owner's (they restore); everyone else only ever sees live products.
  const status = wanted === "active" || wanted === "hidden" || (wanted === "archived" && isOwner) ? wanted : null;
  const deleted = one("deleted")?.slice(0, 120);
  // Files of the deleted product left in Storage: a count, or -1 when the folder couldn't even be listed.
  const filesKept = Number(one("files") ?? 0) || 0;
  const archived = one("archived")?.slice(0, 120);
  const q = (one("q") ?? "").trim().slice(0, 80);

  const supabase = await createClient();
  // Staff read every product through RLS (hidden ones included). Named columns only: stock_quantity is not granted.
  let query = supabase
    .from("products")
    .select(
      "id, slug, name_ar, kind, price_ils, is_active, archived_at, image_path, category_id, product_variants!product_variants_product_id_fkey (id, is_active, price_ils)",
    )
    .order("name_ar")
    .limit(300);
  if (category) query = query.eq("category_id", category);
  if (status === "archived") query = query.not("archived_at", "is", null);
  else {
    query = query.is("archived_at", null);
    if (status) query = query.eq("is_active", status === "active");
  }
  if (q) query = query.or(`name_ar.ilike.%${q.replace(/[%,()*]/g, "")}%,slug.ilike.%${q.replace(/[%,()*]/g, "")}%`);

  const [{ data, error }, { data: categories }] = await Promise.all([
    query,
    supabase.from("categories").select("id, name_ar").order("sort"),
  ]);
  if (error) console.error("admin products", error.code, error.message);
  const rows = (data ?? []) as Row[];
  const catName = new Map((categories ?? []).map((c) => [c.id as string, c.name_ar as string]));
  const filtered = Boolean(category || status || q);

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ category, status, q: q || null, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/products?${s}` : "/admin/products";
  };

  return (
    <main className={styles.page}>
      <div className={styles.head}>
        <h1 className="title">المنتجات</h1>
        <Link className="ad-btn ad-btn--primary" href="/admin/products/new">
          منتج جديد
        </Link>
      </div>

      <nav className={`ad-chips ${styles.chips}`} aria-label="الحالة">
        <Link className="ad-chip" href={href({ status: null })} aria-current={status === null ? "page" : undefined}>
          الكل
        </Link>
        <Link className="ad-chip" href={href({ status: "active" })} aria-current={status === "active" ? "page" : undefined}>
          ظاهر
        </Link>
        <Link className="ad-chip" href={href({ status: "hidden" })} aria-current={status === "hidden" ? "page" : undefined}>
          مخفي
        </Link>
        {isOwner && (
          <Link className="ad-chip" href={href({ status: "archived" })} aria-current={status === "archived" ? "page" : undefined}>
            المؤرشفة
          </Link>
        )}
      </nav>

      {deleted && !filesKept && (
        <p className="ad-notice ad-notice--ok" role="status">
          حُذف «{deleted}» مع صوره.
        </p>
      )}
      {deleted && filesKept !== 0 && (
        <p className="ad-notice ad-notice--error" role="alert">
          حُذف «{deleted}»، لكن {filesKept > 0 ? keptNote(filesKept) : "تعذّر التأكد من حذف صوره من التخزين. أبلغ المطوّر."}
        </p>
      )}
      {archived && (
        <p className="ad-notice ad-notice--ok" role="status">
          أُرشف «{archived}»: له طلبات أو حركات مخزون، فبقي في السجلات. تجده في «المؤرشفة».
        </p>
      )}

      <form className={styles.filters} action="/admin/products" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="ad-field">
          <label htmlFor="products-q">بحث</label>
          <input id="products-q" name="q" type="search" defaultValue={q} placeholder="اسم المنتج أو رابطه" maxLength={80} />
        </div>
        <div className="ad-field">
          <label htmlFor="products-category">الفئة</label>
          <select id="products-category" name="category" defaultValue={category ?? ""}>
            <option value="">كل الفئات</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_ar}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterActions}>
          <button type="submit" className="ad-btn ad-btn--primary">
            بحث
          </button>
          {filtered && (
            <Link className="ad-btn ad-btn--ghost" href="/admin/products">
              مسح
            </Link>
          )}
        </div>
      </form>

      {error ? (
        <p className="ad-notice ad-notice--error" role="alert">
          تعذّر تحميل المنتجات. حدّث الصفحة بعد قليل.
        </p>
      ) : rows.length === 0 ? (
        <p className={styles.empty} role="status">
          {status === "archived"
            ? "لا منتجات مؤرشفة."
            : filtered
              ? "لا منتجات بهذه الشروط. غيّر البحث أو اضغط «مسح»."
              : "لا منتجات بعد. ابدأ بـ «منتج جديد»."}
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((p) => {
            const active = p.product_variants.filter((v) => v.is_active);
            const prices = active.map((v) => v.price_ils ?? p.price_ils);
            const min = prices.length ? Math.min(...prices) : p.price_ils;
            const varies = new Set(prices).size > 1;
            const src = productImageSrc(p.image_path, "sm");
            return (
              <li key={p.id}>
                <Link href={`/admin/products/${p.id}`} className={styles.row}>
                  <span className={styles.thumb} aria-hidden="true">
                    {src && <Image src={src} alt="" fill sizes="48px" unoptimized />}
                  </span>
                  <span className={styles.main}>
                    <span className={styles.name}>{p.name_ar}</span>
                    <span className={styles.meta}>
                      {catName.get(p.category_id) ?? "—"}
                      {p.kind === "bundle" ? " · بكجة" : active.length > 1 ? ` · ${active.length} نسخ` : ""}
                    </span>
                  </span>
                  <span className={styles.side}>
                    <span className={styles.price}>{varies ? `من ${formatPrice(min)}` : formatPrice(min)}</span>
                    <span className={styles.state} data-active={p.is_active || undefined}>
                      {p.archived_at ? "مؤرشف" : p.is_active ? "ظاهر" : "مخفي"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
