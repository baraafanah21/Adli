import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderActions } from "@/components/admin/OrderActions";
import { ArrowBackIcon } from "@/components/icons";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { STATUS_LABEL, type OrderStatus } from "@/lib/order-status";
import { whatsappDigits } from "@/lib/phone";
import styles from "../order.module.css";

type Detail = {
  id: string;
  code: string;
  status: OrderStatus;
  customer_name: string;
  area: string | null;
  phone: string | null;
  total_ils: number;
  created_at: string;
  account_email: string | null;
  items: {
    id: number;
    name_ar: string;
    variant_name_ar: string | null;
    volume_ml: number | null;
    qty: number;
    unit_price_ils: number;
    available: number;
  }[];
  events: { from_status: OrderStatus | null; to_status: OrderStatus; note: string | null; created_at: string; actor_name: string | null }[];
};

const dateFmt = new Intl.DateTimeFormat("ar-PS-u-nu-latn", { timeZone: "Asia/Hebron", dateStyle: "medium", timeStyle: "short" });

export async function generateMetadata({ params }: PageProps<"/admin/orders/[code]">): Promise<Metadata> {
  const { code } = await params;
  return { title: `الطلب ${decodeURIComponent(code)}` };
}

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[code]">) {
  const { code } = await params;
  await requireRole(["owner", "staff"], `/admin/orders/${code}`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_order", { p_code: decodeURIComponent(code) });
  if (error) throw new Error(`admin_order: ${error.code}`);
  if (!data) notFound();
  const order = data as Detail;

  const wa = whatsappDigits(order.phone);
  const waText = `مرحباً ${order.customer_name}، معك صالون عدلي بخصوص طلبك رقم ${order.code}.`;

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/admin/orders">
        <ArrowBackIcon />
        الطلبات
      </Link>

      <header className={styles.head}>
        <h1 className="title">الطلب {order.code}</h1>
        <span className="ad-status" data-status={order.status}>
          {STATUS_LABEL[order.status]}
        </span>
        <p className={styles.muted}>{dateFmt.format(new Date(order.created_at))}</p>
      </header>

      <OrderActions orderId={order.id} status={order.status} />

      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="order-items">
          <h2 id="order-items" className={styles.h2}>
            الأصناف
          </h2>
          <ul className={styles.lines}>
            {order.items.map((i) => {
              const short = order.status === "new" && i.available < i.qty;
              return (
                <li key={i.id} className={styles.line}>
                  <span>
                    <span className={styles.lineName}>
                      {i.name_ar}
                      {i.variant_name_ar ? ` ${i.variant_name_ar}` : ""}
                    </span>
                    <span className={styles.lineMeta}>
                      {i.qty} × {formatPrice(i.unit_price_ils)}
                      {i.volume_ml ? ` · ${i.volume_ml} مل` : ""}
                    </span>
                    {short && <span className={styles.short}>المتوفر الآن {i.available} فقط</span>}
                  </span>
                  <span className={styles.linePrice}>{formatPrice(i.qty * i.unit_price_ils)}</span>
                </li>
              );
            })}
          </ul>
          <div className="ad-total">
            <span>المجموع</span>
            <span className="ad-price">{formatPrice(order.total_ils)}</span>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="order-customer">
          <h2 id="order-customer" className={styles.h2}>
            الزبون
          </h2>
          <dl className={styles.facts}>
            <div>
              <dt>الاسم</dt>
              <dd>{order.customer_name}</dd>
            </div>
            <div>
              <dt>المنطقة</dt>
              <dd>{order.area ?? "—"}</dd>
            </div>
            <div>
              <dt>الهاتف</dt>
              <dd dir="ltr">{order.phone ? <a href={`tel:${order.phone.replace(/[^\d+]/g, "")}`}>{order.phone}</a> : "—"}</dd>
            </div>
            <div>
              <dt>الحساب</dt>
              <dd>{order.account_email ?? "ضيف (بلا حساب)"}</dd>
            </div>
          </dl>
          {/* Ghost on purpose: the WhatsApp fill is reserved for sending an order. */}
          {wa ? (
            <a
              className="ad-btn ad-btn--ghost ad-btn--block"
              href={`https://wa.me/${wa}?text=${encodeURIComponent(waText)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              محادثة الزبون على واتساب
            </a>
          ) : (
            <p className={styles.muted}>{order.phone ? "رقم الهاتف غير مكتمل، فلا يمكن فتح واتساب منه." : "لم يترك الزبون رقم هاتف."}</p>
          )}
        </section>
      </div>

      <section className={styles.panel} aria-labelledby="order-history">
        <h2 id="order-history" className={styles.h2}>
          السجل
        </h2>
        <ol className={styles.events}>
          {order.events.map((e, n) => (
            <li key={n}>
              <span className={styles.eventWhat}>
                {e.from_status
                  ? `${STATUS_LABEL[e.from_status]} ← ${STATUS_LABEL[e.to_status]}`
                  : "وصل الطلب من الموقع"}
              </span>
              <span className={styles.muted}>
                {dateFmt.format(new Date(e.created_at))}
                {e.from_status ? ` · ${e.actor_name ?? "عضو سابق في الطاقم"}` : e.actor_name ? ` · ${e.actor_name}` : " · ضيف"}
              </span>
              {e.note && <span className={styles.note}>{e.note}</span>}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
