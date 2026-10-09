import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StockAdjustForm } from "@/components/admin/StockAdjustForm";
import { ArrowBackIcon } from "@/components/icons";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { REASON_LABEL, STOCK_STATE_LABEL, type StockReason } from "@/lib/admin/stock";
import styles from "./variant.module.css";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "تعديل المخزون" };

type Movement = {
  id: number;
  delta: number;
  reason: StockReason;
  note: string | null;
  order_code: string | null;
  actor_name: string | null;
  created_at: string;
  balance: number;
};


export default async function StockVariantPage({ params }: PageProps<"/admin/stock/[variantId]">) {
  const { variantId } = await params;
  await requireRole(["owner", "staff"], `/admin/stock/${variantId}`);
  if (!/^[0-9a-f-]{36}$/.test(variantId)) notFound();

  const supabase = await createClient();
  const { data: v } = await supabase
    .from("product_variants")
    .select("id, sku, low_stock_threshold, stock_state, product:products!product_variants_product_id_fkey (id, name_ar, kind)")
    .eq("id", variantId)
    .maybeSingle();
  if (!v) notFound();
  const variant = v as unknown as {
    id: string;
    sku: string;
    low_stock_threshold: number;
    stock_state: "in" | "low" | "out";
    product: { id: string; name_ar: string; kind: "simple" | "bundle" };
  };
  if (variant.product.kind === "bundle") notFound();

  const [stock, label, moves] = await Promise.all([
    supabase.rpc("admin_variant_stock", { p_product_id: variant.product.id }),
    supabase.from("variant_availability").select("label_ar").eq("variant_id", variantId).maybeSingle(),
    supabase.rpc("admin_stock_movements", { p_variant_id: variantId, p_limit: 100 }),
  ]);
  if (stock.error || moves.error) throw new Error(`stock page: ${(stock.error ?? moves.error)?.code}`);
  const current =
    ((stock.data ?? []) as { variant_id: string; stock_quantity: number }[]).find((s) => s.variant_id === variantId)?.stock_quantity ?? 0;
  const name = label.data?.label_ar ? `${variant.product.name_ar} ${label.data.label_ar}` : variant.product.name_ar;
  const movements = (moves.data ?? []) as Movement[];

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/admin/stock">
        <ArrowBackIcon />
        المخزون
      </Link>
      <h1 className="title">{name}</h1>

      <dl className={styles.facts}>
        <div>
          <dt>المخزون الآن</dt>
          <dd className={styles.big}>{current}</dd>
        </div>
        <div>
          <dt>الحالة</dt>
          <dd>
            <span className="ad-stock-state" data-state={variant.stock_state}>
              {STOCK_STATE_LABEL[variant.stock_state]}
            </span>
          </dd>
        </div>
        <div>
          <dt>حد الإنذار</dt>
          <dd>
            {variant.low_stock_threshold}{" "}
            <Link className={styles.small} href={`/admin/products/${variant.product.id}`}>
              تعديله من المنتج
            </Link>
          </dd>
        </div>
        <div>
          <dt>SKU</dt>
          <dd dir="ltr">{variant.sku}</dd>
        </div>
      </dl>

      <StockAdjustForm variantId={variant.id} current={current} />

      <section className={styles.history} aria-labelledby="moves-title">
        <h2 id="moves-title" className={styles.h2}>
          سجل الحركات
        </h2>
        {movements.length === 0 ? (
          <p className={styles.muted}>لا حركات بعد.</p>
        ) : (
          <ol className={styles.moves}>
            {movements.map((m) => (
              <li key={m.id}>
                <span className={styles.delta} data-sign={m.delta > 0 ? "plus" : "minus"} dir="ltr">
                  {m.delta > 0 ? `+${m.delta}` : m.delta}
                </span>
                <span className={styles.what}>
                  {REASON_LABEL[m.reason]}
                  {m.order_code && (
                    <>
                      {" "}
                      <Link href={`/admin/orders/${m.order_code}`}>{m.order_code}</Link>
                    </>
                  )}
                  {m.note && <span className={styles.note}>{m.note}</span>}
                  <span className={styles.muted}>
                    {formatDateTime(m.created_at)}
                    {m.actor_name ? ` · ${m.actor_name}` : ""}
                  </span>
                </span>
                <span className={styles.balance}>الرصيد {m.balance}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
