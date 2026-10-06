import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BundleEditor, type BundleChoice } from "@/components/admin/BundleEditor";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { OptionsEditor, type EditorOption } from "@/components/admin/OptionsEditor";
import { ProductDetailsForm, type EditableProduct } from "@/components/admin/ProductDetailsForm";
import { VariantsEditor, type EditorVariant } from "@/components/admin/VariantsEditor";
import { ArrowBackIcon } from "@/components/icons";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { StockState } from "@/lib/catalog";
import formStyles from "@/components/admin/forms.module.css";
import styles from "../products.module.css";

export const metadata: Metadata = { title: "تعديل منتج" };

type ProductRow = EditableProduct & {
  image_path: string | null;
  product_options: (Omit<EditorOption, "values"> & { product_option_values: { id: string; label_ar: string; hex: string | null; sort: number }[] })[];
  product_variants: {
    id: string;
    sku: string;
    option_value_ids: string[];
    label_ar: string | null;
    price_ils: number | null;
    low_stock_threshold: number;
    stock_state: StockState;
    is_active: boolean;
    sort: number;
  }[];
};

const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort;

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  await requireRole(["owner", "staff"], `/admin/products/${id}`);
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await createClient();
  // Named columns only (stock_quantity is not granted); quantities come from admin_variant_stock().
  const [{ data, error }, { data: categories }, stock, labels] = await Promise.all([
    supabase
      .from("products")
      .select(
        `id, slug, name_ar, family_ar, description_ar, price_ils, volume_ml, category_id, sort, is_active, kind, image_path,
         product_options (id, name_ar, kind, sort, product_option_values (id, label_ar, hex, sort)),
         product_variants!product_variants_product_id_fkey (id, sku, option_value_ids, label_ar, price_ils, low_stock_threshold, stock_state, is_active, sort)`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("categories").select("id, name_ar").order("sort"),
    supabase.rpc("admin_variant_stock", { p_product_id: id }),
    supabase.from("variant_availability").select("variant_id, label_ar").eq("product_id", id),
  ]);
  if (error || stock.error) throw new Error(`product editor: ${(error ?? stock.error)?.code}`);
  if (!data) notFound();
  const p = data as unknown as ProductRow;

  const qty = new Map(((stock.data ?? []) as { variant_id: string; stock_quantity: number }[]).map((s) => [s.variant_id, s.stock_quantity]));
  const label = new Map(((labels.data ?? []) as { variant_id: string; label_ar: string | null }[]).map((l) => [l.variant_id, l.label_ar]));

  const options: EditorOption[] = [...p.product_options].sort(bySort).map((o) => ({
    id: o.id,
    name_ar: o.name_ar,
    kind: o.kind,
    sort: o.sort,
    values: [...o.product_option_values].sort(bySort).map(({ id, label_ar, hex }) => ({ id, label_ar, hex })),
  }));
  const variants: EditorVariant[] = [...p.product_variants].sort(bySort).map((v) => ({
    id: v.id,
    sku: v.sku,
    label: label.get(v.id) ?? null,
    label_override: v.label_ar,
    price_ils: v.price_ils,
    low_stock_threshold: v.low_stock_threshold,
    stock_quantity: qty.get(v.id) ?? 0,
    stock_state: v.stock_state,
    is_active: v.is_active,
    sort: v.sort,
    option_count: v.option_value_ids.length,
  }));
  const usedValueIds = [...new Set(p.product_variants.flatMap((v) => v.option_value_ids))];

  // Bundles: the current pieces, and every simple product's variants to choose from.
  let bundle: { items: { variant_id: string; qty: number }[]; choices: BundleChoice[] } | null = null;
  if (p.kind === "bundle") {
    const [items, simple, allLabels] = await Promise.all([
      supabase.from("bundle_items").select("variant_id, qty, sort").eq("bundle_product_id", id).order("sort"),
      supabase
        .from("products")
        .select("name_ar, price_ils, is_active, product_variants!product_variants_product_id_fkey (id, price_ils, is_active, sort)")
        .eq("kind", "simple")
        .order("name_ar"),
      supabase.from("variant_availability").select("variant_id, label_ar"),
    ]);
    const labelOf = new Map(((allLabels.data ?? []) as { variant_id: string; label_ar: string | null }[]).map((l) => [l.variant_id, l.label_ar]));
    type Simple = { name_ar: string; price_ils: number; is_active: boolean; product_variants: { id: string; price_ils: number | null; is_active: boolean; sort: number }[] };
    bundle = {
      items: ((items.data ?? []) as { variant_id: string; qty: number }[]).map(({ variant_id, qty }) => ({ variant_id, qty })),
      choices: ((simple.data ?? []) as Simple[]).flatMap((s) =>
        [...s.product_variants].sort(bySort).map((v) => {
          const l = labelOf.get(v.id);
          return {
            variant_id: v.id,
            name: l ? `${s.name_ar} ${l}` : s.name_ar,
            price_ils: v.price_ils ?? s.price_ils,
            is_active: s.is_active && v.is_active,
          };
        }),
      ),
    };
  }

  const product: EditableProduct = {
    id: p.id,
    slug: p.slug,
    name_ar: p.name_ar,
    family_ar: p.family_ar,
    description_ar: p.description_ar,
    price_ils: p.price_ils,
    volume_ml: p.volume_ml,
    category_id: p.category_id,
    sort: p.sort,
    is_active: p.is_active,
    kind: p.kind,
  };

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/admin/products">
        <ArrowBackIcon />
        المنتجات
      </Link>
      <div className={styles.head}>
        <h1 className="title">{p.name_ar}</h1>
        <span className={styles.state} data-active={p.is_active || undefined}>
          {p.is_active ? "ظاهر" : "مخفي"}
        </span>
      </div>
      {sp.created === "1" && (
        <p className="ad-notice ad-notice--ok" role="status">
          أُنشئ المنتج. أضف صورته{p.kind === "bundle" ? " ومحتواه" : " وخياراته إن وُجدت"}، ثم أظهره من «التفاصيل».
        </p>
      )}
      <Link className={styles.siteLink} href={`/p/${p.slug}`} target="_blank">
        عرض في الموقع
      </Link>

      <section className={formStyles.section} aria-labelledby="img-title">
        <h2 id="img-title">الصورة</h2>
        <ImageUploader productId={p.id} current={p.image_path} name={p.name_ar} />
      </section>

      <ProductDetailsForm product={product} categories={categories ?? []} />

      {p.kind === "bundle" && bundle ? (
        <BundleEditor productId={p.id} price={p.price_ils} items={bundle.items} choices={bundle.choices} />
      ) : (
        <>
          <OptionsEditor productId={p.id} options={options} usedValueIds={usedValueIds} />
          <VariantsEditor productId={p.id} productPrice={p.price_ils} variants={variants} optionCount={options.length} />
        </>
      )}
    </main>
  );
}
