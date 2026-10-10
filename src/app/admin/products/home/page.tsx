import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { HOME_SHELF, getCatalog, homeShelf } from "@/lib/catalog";
import { setHomeProducts } from "../actions";
import styles from "../products.module.css";

export const metadata: Metadata = { title: "منتجات الرئيسية" };

/**
 * «منتجات الرئيسية» (owner): which products the home page shows in its 4 places. A place left on «تلقائي» takes one
 * product per category in turn (homeShelf), so choosing two keeps the other two automatic.
 */
export default async function HomeProductsPage() {
  await requireRole(["owner"], "/admin/products/home");
  const supabase = await createClient();
  const [productsRes, categoriesRes, slotsRes, catalog] = await Promise.all([
    // Live products only: the function refuses hidden and archived ones.
    supabase.from("products").select("id, name_ar, category_id").eq("is_active", true).is("archived_at", null).order("name_ar"),
    supabase.from("categories").select("id, name_ar").order("sort"),
    supabase.from("home_products").select("slot, product_id").order("slot"),
    getCatalog(),
  ]);
  for (const [name, res] of [
    ["products", productsRes],
    ["categories", categoriesRes],
    ["slots", slotsRes],
  ] as const) {
    if (res.error) console.error(`admin home products ${name}`, res.error.code, res.error.message);
  }
  const products = (productsRes.data ?? []) as { id: string; name_ar: string; category_id: string }[];
  const categories = (categoriesRes.data ?? []) as { id: string; name_ar: string }[];
  const chosen = ((slotsRes.data ?? []) as { slot: number; product_id: string }[]).map((s) => s.product_id);
  const groups = categories
    .map((c) => ({ ...c, products: products.filter((p) => p.category_id === c.id) }))
    .filter((g) => g.products.length > 0);
  // What the home page shows right now (the shop's cached catalog): chosen ones first, then automatic ones.
  const now = catalog.data ? homeShelf(catalog.data.products, catalog.data.home) : null;
  const picked = new Set(catalog.data?.home ?? []);
  const failed = Boolean(productsRes.error || slotsRes.error);

  return (
    <main className={styles.page}>
      <div className={styles.head}>
        <h1 className="title">منتجات الرئيسية</h1>
        <Link className="ad-btn ad-btn--ghost" href="/admin/products">
          كل المنتجات
        </Link>
      </div>
      <p className={styles.intro}>
        اختر ما يظهر في الصفحة الرئيسية تحت «منتجات الصالون»، بالترتيب. المكان المتروك على «تلقائي» يأخذ منتجاً من فئة
        مختلفة بالدور. المنتجات الظاهرة فقط؛ منتج تخفيه لاحقاً يختفي من الرئيسية ويحل مكانه منتج تلقائي.
      </p>

      {failed ? (
        <p className="ad-notice ad-notice--error" role="alert">
          تعذّر تحميل المنتجات. حدّث الصفحة بعد قليل.
        </p>
      ) : (
        <ActionForm action={setHomeProducts} submit="احفظ منتجات الرئيسية">
          {Array.from({ length: HOME_SHELF }, (_, i) => (
            <div className="ad-field" key={i}>
              <label htmlFor={`home-slot-${i + 1}`}>المكان {i + 1}</label>
              <select id={`home-slot-${i + 1}`} name="slot" defaultValue={chosen[i] ?? ""}>
                <option value="">تلقائي</option>
                {groups.map((g) => (
                  <optgroup key={g.id} label={g.name_ar}>
                    {g.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name_ar}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          ))}
        </ActionForm>
      )}

      {now && now.length > 0 && (
        <section aria-labelledby="home-now">
          <h2 id="home-now" className="title">
            في الرئيسية الآن
          </h2>
          <ol className={styles.list}>
            {now.map((p) => (
              <li key={p.id} className={styles.row}>
                <span className={styles.main}>
                  <span className={styles.name}>{p.name_ar}</span>
                  <span className={styles.meta}>{picked.has(p.id) ? "اخترته أنت" : "تلقائي"}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
