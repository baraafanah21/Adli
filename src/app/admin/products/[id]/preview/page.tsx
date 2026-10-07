import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductPurchase } from "@/components/ProductPurchase";
import { ProductView, initialVariant } from "@/components/ProductView";
import { ArrowBackIcon } from "@/components/icons";
import { requireRole } from "@/lib/auth/guards";
import { loadProduct } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";
import styles from "../../products.module.css";

export const metadata: Metadata = { title: "معاينة منتج" };

/**
 * The product page as customers will see it, for staff: hidden and archived products included (read with the staff
 * session, RLS lets staff read the whole catalog). Never cached. The shop's /p/<slug> shows active products only.
 */
export default async function ProductPreviewPage({ params }: PageProps<"/admin/products/[id]/preview">) {
  const { id } = await params;
  await requireRole(["owner", "staff"], `/admin/products/${id}/preview`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await createClient();
  const [product, { data: state }] = await Promise.all([
    loadProduct(supabase, { id }),
    supabase.from("products").select("archived_at").eq("id", id).maybeSingle(),
  ]);
  if (!product) notFound();
  const archived = Boolean((state as { archived_at: string | null } | null)?.archived_at);

  const note = archived
    ? "مؤرشف: لا يظهر في الموقع. هكذا كان يظهر للزبائن."
    : product.is_active
      ? "معاينة: هذا المنتج ظاهر في الموقع الآن."
      : "مخفي: هكذا سيظهر للزبائن بعد إظهاره من «التفاصيل». الطلب منه يُرفض حتى ذلك الحين.";

  return (
    <>
      <div className={styles.previewBar}>
        <Link className={styles.back} href={`/admin/products/${id}`}>
          <ArrowBackIcon />
          رجوع للتعديل
        </Link>
        {product.is_active && (
          <Link className={styles.siteLink} href={`/p/${product.slug}`} target="_blank">
            افتح في الموقع
          </Link>
        )}
      </div>
      <ProductView
        product={product}
        note={note}
        purchase={
          <ProductPurchase
            product={product}
            options={product.options}
            variants={product.variants}
            initialSku={initialVariant(product)?.sku ?? ""}
          />
        }
      />
    </>
  );
}
