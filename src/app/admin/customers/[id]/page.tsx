import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { BlockCustomer } from "@/components/admin/customers/BlockCustomer";
import { ArrowBackIcon, WhatsAppIcon } from "@/components/icons";
import { clearFlag } from "@/app/admin/bookings/actions";
import { resetBookingRate, saveCustomerNote, unblockCustomer } from "@/app/admin/customers/actions";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { formatWhen } from "@/lib/bookings";
import { ADMIN_STATUS_LABEL } from "@/lib/admin/bookings";
import { STATUS_LABEL } from "@/lib/order-status";
import { whatsappDigits } from "@/lib/phone";
import { customerName, formatShortDate, type CustomerDetail } from "@/lib/admin/customers";
import formStyles from "@/components/admin/forms.module.css";
import list from "../../products/products.module.css";
import styles from "../customers.module.css";

export const metadata: Metadata = { title: "زبون" };

/**
 * One customer (E3.2): details, the record (bookings, orders, flags, blocks, limit resets) and what the salon can do.
 * The note is for the staff only. Each order's amount shows to staff; the total spent only to the owner (null here
 * for anyone else, from the database). Block / unblock: owner only.
 */
export default async function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  const { role } = await requireRole(["owner", "staff"], `/admin/customers/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const isOwner = role.role === "owner";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_customer", { p_user_id: id });
  if (error?.code === "P0006") notFound();
  if (error) throw new Error(`customer: ${error.code}`);
  const c = data as CustomerDetail;
  const name = customerName(c.profile);
  const wa = whatsappDigits(c.profile.phone);
  const openFlag = c.flags.find((f) => !f.cleared_at) ?? null;

  return (
    <main className={list.page}>
      <Link className={list.back} href="/admin/customers">
        <ArrowBackIcon />
        الزبائن
      </Link>
      <div className={list.head}>
        <h1 className="title">{name}</h1>
        {wa && (
          <a className="ad-btn ad-btn--ghost" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon />
            واتساب
          </a>
        )}
      </div>
      {(c.blocked || openFlag || c.rate.limited) && (
        <p className={styles.badges}>
          {c.blocked && (
            <span className={styles.badge} data-tone="blocked">
              محظور
            </span>
          )}
          {openFlag && (
            <span className={styles.badge} data-tone="flag">
              تخلّف عن موعد
            </span>
          )}
          {c.rate.limited && <span className={styles.badge}>وصل حد المحاولات</span>}
        </p>
      )}

      <section className={formStyles.section} aria-labelledby="facts-title">
        <h2 id="facts-title">بياناته</h2>
        <dl className={styles.facts}>
          <div>
            <dt>الجوال</dt>
            <dd>{c.profile.phone ? <bdi dir="ltr">{c.profile.phone}</bdi> : "—"}</dd>
          </div>
          <div>
            <dt>الإيميل</dt>
            <dd>{c.profile.email ? <bdi dir="ltr">{c.profile.email}</bdi> : "—"}</dd>
          </div>
          <div>
            <dt>المنطقة</dt>
            <dd>{c.profile.area ?? "—"}</dd>
          </div>
          <div>
            <dt>سجّل</dt>
            <dd>{formatShortDate(c.profile.joined_at)}</dd>
          </div>
          <div>
            <dt>آخر زيارة</dt>
            <dd>{c.last_visit ? formatShortDate(c.last_visit) : "—"}</dd>
          </div>
          <div>
            <dt>حضر / لم يحضر / ملغى</dt>
            <dd>
              {c.attended} / {c.no_show} / {c.cancelled}
            </dd>
          </div>
          {isOwner && c.spent_ils !== null && (
            <div>
              <dt>مشترياته</dt>
              <dd>{formatPrice(c.spent_ils)}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className={formStyles.section} aria-labelledby="act-title">
        <h2 id="act-title">إجراءات</h2>
        <p className={styles.private}>
          حجوزات آخر ساعة: {c.rate.in_window} من {c.rate.per_hour}
          {c.rate.resets[0] ? ` · آخر تصفير ${formatWhen(c.rate.resets[0].reset_at)} (${c.rate.resets[0].reset_by ?? "الطاقم"})` : ""}
        </p>
        <div className={styles.actions}>
          {c.rate.limited && (
            <ActionForm action={resetBookingRate} submit="صفّر حد المحاولات" pendingLabel="جارٍ التصفير…" variant="ghost">
              <input type="hidden" name="userId" value={id} />
            </ActionForm>
          )}
          {isOwner && !c.blocked && <BlockCustomer userId={id} name={name} />}
        </div>
        {openFlag && (
          <ActionForm action={clearFlag} submit="ارفع الوسم" pendingLabel="جارٍ الرفع…" variant="ghost">
            <input type="hidden" name="userId" value={id} />
            <div className="ad-field">
              <label htmlFor="flag-note">ملاحظة (اختياري)</label>
              <input id="flag-note" name="note" maxLength={300} autoComplete="off" />
            </div>
          </ActionForm>
        )}
        {isOwner && c.blocked && (
          <ActionForm action={unblockCustomer} submit="ارفع الحظر" pendingLabel="جارٍ الرفع…" variant="ghost">
            <input type="hidden" name="userId" value={id} />
            <p className={styles.private}>محظور منذ {formatWhen(c.blocks[0].blocked_at)}: {c.blocks[0].reason}</p>
            <div className="ad-field">
              <label htmlFor="unblock-note">ملاحظة (اختياري)</label>
              <input id="unblock-note" name="note" maxLength={300} autoComplete="off" />
            </div>
          </ActionForm>
        )}
      </section>

      <section className={`${formStyles.section} ${styles.note}`} aria-labelledby="note-title">
        <h2 id="note-title">ملاحظة للطاقم</h2>
        <p className={styles.private}>
          لا يراها الزبون أبداً.
          {c.note ? ` آخر تعديل ${formatWhen(c.note.updated_at)} (${c.note.updated_by ?? "الطاقم"}).` : ""}
        </p>
        <ActionForm action={saveCustomerNote} submit="احفظ الملاحظة">
          <input type="hidden" name="userId" value={id} />
          <label className="sr-only" htmlFor="customer-note">
            الملاحظة
          </label>
          <textarea id="customer-note" name="note" maxLength={1000} defaultValue={c.note?.text ?? ""} />
        </ActionForm>
      </section>

      <section className={formStyles.section} aria-labelledby="bookings-title">
        <h2 id="bookings-title">حجوزاته ({c.bookings.length})</h2>
        {c.bookings.length === 0 ? (
          <p className={styles.private}>لا حجوزات.</p>
        ) : (
          <ul className={styles.history}>
            {c.bookings.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/bookings?day=${b.day}#b-${b.id}`}>
                  {formatWhen(b.starts_at)} · {b.service_name_ar} · {b.barber_name_ar}
                </Link>
                <span className={styles.muted}>
                  {ADMIN_STATUS_LABEL[b.status]} · {b.code}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={formStyles.section} aria-labelledby="orders-title">
        <h2 id="orders-title">طلباته ({c.orders.length})</h2>
        {c.orders.length === 0 ? (
          <p className={styles.private}>لا طلبات من حسابه.</p>
        ) : (
          <ul className={styles.history}>
            {c.orders.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.code}`}>
                  {o.code} · {formatShortDate(o.created_at)}
                </Link>
                <span className={styles.muted}>
                  {STATUS_LABEL[o.status]} · {formatPrice(o.total_ils)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(c.flags.length > 0 || c.blocks.length > 0) && (
        <section className={formStyles.section} aria-labelledby="record-title">
          <h2 id="record-title">الوسوم والحظر</h2>
          <ul className={styles.history}>
            {c.flags.map((f) => (
              <li key={`f${f.id}`}>
                <span>
                  وسم «تخلّف عن موعد»{f.booking_code ? ` (${f.booking_code})` : ""}: {formatWhen(f.flagged_at)}، {f.flagged_by ?? "النظام"}
                </span>
                <span className={styles.muted}>
                  {f.cleared_at
                    ? `رُفع ${formatWhen(f.cleared_at)}، ${f.cleared_by ?? "الطاقم"}${f.clear_note ? `: ${f.clear_note}` : ""}`
                    : "مفتوح"}
                </span>
              </li>
            ))}
            {c.blocks.map((k) => (
              <li key={`b${k.blocked_at}`}>
                <span>
                  حظر: {formatWhen(k.blocked_at)}، {k.blocked_by ?? "صاحب الصالون"}: {k.reason}
                </span>
                <span className={styles.muted}>
                  {k.unblocked_at
                    ? `رُفع ${formatWhen(k.unblocked_at)}، ${k.unblocked_by ?? "صاحب الصالون"}${k.unblock_note ? `: ${k.unblock_note}` : ""}`
                    : "مفتوح"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
