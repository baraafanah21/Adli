"use client";

import { useActionState, useState } from "react";
import { cancelMyBooking, type CancelState } from "@/app/(site)/account/actions";
import { whatsappUrl } from "@/lib/whatsapp";
import styles from "./booking.module.css";

/** `cancellable`: decided on the server when the page was rendered (2 hours or more before the start). */
type Props = { bookingId: string; code: string; cancellable: boolean };

/**
 * Two presses: «ألغِ الموعد», then «نعم، ألغِ الموعد». Less than 2 hours before the start the site can't cancel;
 * the customer is sent to the salon on WhatsApp instead (a plain link: the WhatsApp fill is for orders only).
 */
export function CancelBooking({ bookingId, code, cancellable }: Props) {
  const [state, action, pending] = useActionState<CancelState, FormData>(cancelMyBooking, {});
  const [asking, setAsking] = useState(false);
  const contact = whatsappUrl(`مرحباً صالون عدلي، بخصوص موعدي رقم ${code}.`);

  if (state.error === "too_late" || !cancellable) {
    return (
      <p className={styles.muted}>
        الإلغاء من الموقع يتوقف قبل الموعد بساعتين. إذا لم تستطع الحضور{" "}
        <a className={styles.inlineButton} href={contact} target="_blank" rel="noopener noreferrer">
          تواصل مع الصالون
        </a>
        .
      </p>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="booking_id" value={bookingId} />
      {state.error === "changed" && (
        <p className={styles.error} role="alert">
          تغيّرت حالة هذا الموعد. حدّث الصفحة لترى حالته الآن.
        </p>
      )}
      {state.error === "failed" && (
        <p className={styles.error} role="alert">
          تعذّر إلغاء الموعد الآن. حاول مرة أخرى بعد قليل.
        </p>
      )}
      {asking ? (
        <div className="ad-chips">
          <button type="submit" className="ad-btn ad-btn--primary" disabled={pending}>
            {pending ? "جارٍ الإلغاء…" : "نعم، ألغِ الموعد"}
          </button>
          <button type="button" className="ad-btn ad-btn--ghost" onClick={() => setAsking(false)} disabled={pending}>
            لا، أبقِه
          </button>
        </div>
      ) : (
        <button type="button" className="ad-btn ad-btn--ghost" onClick={() => setAsking(true)}>
          ألغِ الموعد
        </button>
      )}
    </form>
  );
}
