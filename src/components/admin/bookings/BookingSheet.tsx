"use client";

import { useActionState, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { addWalkIn, clearFlag, closeTime, deleteClosure, setBookingPaid, setBookingStatus } from "@/app/admin/bookings/actions";
import { formatPrice } from "@/lib/format";
import { formatSlot, minutesToHHMM, type BookingStatus } from "@/lib/bookings";
import { reminderUrl, type DayBarber, type DayBooking, type DayClosure } from "@/lib/admin/bookings";
import { formatTime } from "@/lib/salon";
import type { ActionState } from "@/lib/admin/errors";
import { PhoneField } from "@/components/PhoneField";
import type { Service } from "./BookingsBoard";
import styles from "./bookings.module.css";

export type SheetState =
  | { kind: "slot"; barberId: string; start: number }
  | { kind: "walkin"; barberId: string | null; start: number }
  | { kind: "close"; barberId: string | null; start: number }
  | { kind: "booking"; booking: DayBooking }
  | { kind: "closure"; closure: DayClosure; label?: string }
  | { kind: "flag"; userId: string; name: string };

type Props = {
  state: SheetState | null;
  onClose: () => void;
  onSwitch: (next: SheetState) => void;
  onDone: (message: string) => void;
  day: string;
  barbers: DayBarber[];
  /** Barbers this person may close time for (all for the owner, their own for a barber). */
  closable: DayBarber[];
  isOwner: boolean;
  services: Service[];
  barberName: (id: string | null) => string;
  canClose: (barberId: string | null) => boolean;
  statusLabel: Record<BookingStatus, string>;
  /** Now, from the board's clock (null before hydration). */
  nowMs: number | null;
};

/** An action that closes the sheet and reports on the page when it succeeds; an error stays in the sheet. */
function useSheetAction(action: (s: ActionState, f: FormData) => Promise<ActionState>, onDone: (m: string) => void) {
  return useActionState<ActionState, FormData>(async (prev, form) => {
    const result = await action(prev, form);
    if (result?.ok) onDone(result.message);
    return result;
  }, null);
}

function Result({ state }: { state: ActionState }) {
  if (!state || state.ok) return null;
  return (
    <p className="ad-notice ad-notice--error" role="alert">
      {state.message}
    </p>
  );
}

/** The calendar's one bottom sheet (a side panel on a wide screen). Its content follows `state`. */
export function BookingSheet(props: Props) {
  const { state, onClose } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (state && !d.open) d.showModal();
    if (!state && d.open) d.close();
  }, [state]);

  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const title =
    state?.kind === "booking"
      ? `${formatSlot(state.booking.starts_at)} · ${state.booking.customer_name ?? "زبون"}`
      : state?.kind === "walkin"
        ? "زبون بدون موعد"
        : state?.kind === "close"
          ? "سكّر وقت"
          : state?.kind === "closure"
            ? "وقت مسكّر"
            : state?.kind === "flag"
              ? "ارفع الوسم"
              : state?.kind === "slot"
                ? `${formatTime(minutesToHHMM(state.start))} · ${props.barberName(state.barberId)}`
                : "";

  return (
    <dialog ref={ref} className="ad-sheet-dialog" aria-labelledby={titleId} onClose={onClose} onClick={onBackdrop}>
      <section className="ad-sheet">
        <div className="ad-sheet__grip" aria-hidden="true" />
        <div className="ad-sheet__head">
          <h2 className="ad-sheet__title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="ad-sheet__close" onClick={onClose} aria-label="إغلاق">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {/* key: a new sheet starts with fresh fields and no old error. */}
        {state && <SheetBody key={JSON.stringify(state)} {...props} state={state} />}
      </section>
    </dialog>
  );
}

function SheetBody(props: Props & { state: SheetState }) {
  const { state } = props;
  switch (state.kind) {
    case "slot":
      return (
        <div className={styles.sheetStack}>
          <button type="button" className="ad-btn ad-btn--primary ad-btn--block" onClick={() => props.onSwitch({ ...state, kind: "walkin" })}>
            زبون بدون موعد هنا
          </button>
          {props.canClose(state.barberId) && (
            <button type="button" className="ad-btn ad-btn--ghost ad-btn--block" onClick={() => props.onSwitch({ ...state, kind: "close" })}>
              سكّر هذا الوقت
            </button>
          )}
        </div>
      );
    case "walkin":
      return <WalkInForm {...props} barberId={state.barberId} start={state.start} />;
    case "close":
      return <CloseForm {...props} barberId={state.barberId} start={state.start} />;
    case "booking":
      return <BookingDetails {...props} booking={state.booking} />;
    case "closure":
      return <ClosureDetails {...props} closure={state.closure} label={state.label} />;
    case "flag":
      return <FlagForm {...props} userId={state.userId} name={state.name} />;
  }
}

function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="ad-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <span className="ad-field__hint">{hint}</span>}
    </div>
  );
}

function WalkInForm({ day, barbers, services, barberId, start, onDone }: Props & { barberId: string | null; start: number }) {
  const [state, action, pending] = useSheetAction(addWalkIn, onDone);
  return (
    <form action={action} className={styles.sheetStack}>
      <input type="hidden" name="day" value={day} />
      <Field label="الحلاق">
        {(id) => (
          <select id={id} name="barberId" defaultValue={barberId ?? ""} required>
            {barbers
              .filter((b) => b.is_active)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
          </select>
        )}
      </Field>
      <Field label="الخدمة">
        {(id) => (
          <select id={id} name="serviceId" defaultValue={services[0]?.id} required>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_ar} · {s.duration_min} دقيقة
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="الوقت" hint="على رأس 5 دقائق.">
        {(id) => <input id={id} type="time" name="time" step={300} defaultValue={minutesToHHMM(start)} required dir="ltr" />}
      </Field>
      <Field label="الاسم (اختياري)">{(id) => <input id={id} name="name" maxLength={80} autoComplete="off" />}</Field>
      <Field label="الجوال (اختياري)">
        {/* Empty, the prefix too: chosen for each customer (the same 05… can be on WhatsApp under either). */}
        {(id) => <PhoneField id={id} name="phone" />}
      </Field>
      <Result state={state} />
      <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={pending}>
        {pending ? "جارٍ الإضافة…" : "أضف الزبون"}
      </button>
    </form>
  );
}

function CloseForm({ day, closable, isOwner, barberId, start, onDone }: Props & { barberId: string | null; start: number }) {
  const [state, action, pending] = useSheetAction(closeTime, onDone);
  const [weekly, setWeekly] = useState(false);
  return (
    <form action={action} className={styles.sheetStack}>
      <Field label="لمن">
        {(id) => (
          <select id={id} name="barberId" defaultValue={barberId ?? "salon"} required>
            {closable.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name_ar}
              </option>
            ))}
            {isOwner && <option value="salon">الصالون كله</option>}
          </select>
        )}
      </Field>
      <Field label={weekly ? "يبدأ من يوم" : "اليوم"}>{(id) => <input id={id} type="date" name="day" defaultValue={day} required />}</Field>
      <div className={styles.twoUp}>
        <Field label="من">
          {(id) => <input id={id} type="time" name="from" step={300} defaultValue={minutesToHHMM(start)} required dir="ltr" />}
        </Field>
        <Field label="إلى">
          {(id) => <input id={id} type="time" name="to" step={300} defaultValue={minutesToHHMM(Math.min(start + 30, 23 * 60 + 55))} required dir="ltr" />}
        </Field>
      </div>
      <label className="ad-check">
        <input type="checkbox" name="weekly" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
        كل أسبوع في نفس اليوم والوقت
      </label>
      <Field label={weekly ? "حتى تاريخ (اختياري)" : "إلى يوم (اختياري، لإغلاق عدة أيام)"}>
        {(id) => <input id={id} type="date" name="untilDay" />}
      </Field>
      <Field label="السبب (اختياري)">{(id) => <input id={id} name="reason" maxLength={200} placeholder="استراحة، إجازة…" />}</Field>
      <Result state={state} />
      <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={pending}>
        {pending ? "جارٍ الحفظ…" : "سكّر الوقت"}
      </button>
    </form>
  );
}

type Move = {
  to: "confirmed" | "rejected" | "cancelled" | "completed" | "no_show";
  label: string;
  ask?: string;
  reason?: boolean;
  /** «حضر»: asks for the amount paid, filled with the booking's price. */
  paid?: boolean;
};

/** What the staff can do from each status. «حضر» and «لم يحضر» only once the start time has come. */
function movesFor(b: DayBooking, started: boolean): Move[] {
  switch (b.status) {
    case "pending":
      return [
        { to: "confirmed", label: "أكّد الموعد" },
        { to: "rejected", label: "ارفض", ask: "سيظهر للزبون أن الصالون لم يؤكد موعده، مع السبب.", reason: true },
      ];
    case "confirmed":
      return [
        ...(started
          ? ([
              { to: "completed", label: "حضر", paid: true },
              {
                to: "no_show",
                label: "لم يحضر",
                ask: b.user_id
                  ? "سيوضع على حسابه وسم «تخلّف عن موعد»، ومواعيده الجديدة تنتظر تأكيدك حتى ترفعه."
                  : "يُسجَّل الموعد «لم يحضر» ويُفتح وقته.",
              },
            ] as Move[])
          : []),
        { to: "cancelled", label: "ألغِ الموعد", ask: "سيظهر الإلغاء والسبب للزبون في حسابه.", reason: true },
      ];
    case "no_show":
      return [{ to: "completed", label: "حضر (تصحيح)", ask: "يُسجَّل «حضر»، ويُرفع الوسم الذي وضعه هذا الموعد.", paid: true }];
    default:
      return [];
  }
}

function BookingDetails({ booking: b, barberName, statusLabel, nowMs, onDone, onSwitch }: Props & { booking: DayBooking }) {
  const [state, action, pending] = useSheetAction(setBookingStatus, onDone);
  const [asking, setAsking] = useState<Move | null>(null);
  const noteId = useId();
  const paidId = useId();
  const started = nowMs !== null && nowMs >= Date.parse(b.starts_at);
  const moves = movesFor(b, started);
  const remind = reminderUrl(b, barberName(b.barber_id));

  return (
    <div className={styles.sheetStack}>
      <dl className={styles.facts}>
        <div>
          <dt>الحالة</dt>
          <dd>
            <span className="ad-status" data-status={b.status === "pending" ? "new" : b.status === "completed" ? "done" : b.status}>
              {statusLabel[b.status]}
            </span>
          </dd>
        </div>
        <div>
          <dt>الوقت</dt>
          <dd>
            {formatSlot(b.starts_at)} – {formatSlot(b.ends_at)}
          </dd>
        </div>
        <div>
          <dt>الخدمة</dt>
          <dd>
            {b.service_name_ar} · {formatPrice(b.price_ils)}
          </dd>
        </div>
        {b.status === "completed" && b.paid_ils !== null && (
          <div>
            <dt>المدفوع</dt>
            <dd>{formatPrice(b.paid_ils)}</dd>
          </div>
        )}
        <div>
          <dt>الحلاق</dt>
          <dd>{barberName(b.barber_id)}</dd>
        </div>
        <div>
          <dt>الزبون</dt>
          <dd>
            {b.customer_name ?? "—"}
            {b.kind === "walk_in" ? " · بدون موعد" : ""}
          </dd>
        </div>
        {b.phone && (
          <div>
            <dt>الجوال</dt>
            <dd>
              <a href={`tel:${b.phone}`} dir="ltr">
                {b.phone}
              </a>
            </dd>
          </div>
        )}
        <div>
          <dt>رقم الحجز</dt>
          <dd dir="ltr">{b.code}</dd>
        </div>
        {b.cancel_reason && (
          <div>
            <dt>السبب</dt>
            <dd>{b.cancel_reason}</dd>
          </div>
        )}
      </dl>

      {b.flagged && b.user_id && (
        <p className="ad-notice ad-notice--error">
          على حساب هذا الزبون وسم «تخلّف عن موعد».{" "}
          <button type="button" className={styles.inlineButton} onClick={() => onSwitch({ kind: "flag", userId: b.user_id!, name: b.customer_name ?? "الزبون" })}>
            ارفع الوسم
          </button>
        </p>
      )}

      {moves.length > 0 && (
        <form action={action} className={styles.sheetStack}>
          <input type="hidden" name="bookingId" value={b.id} />
          {asking ? (
            <div className={styles.sheetStack} role="group" aria-label={asking.label}>
              {asking.ask && <p className={styles.question}>{asking.ask}</p>}
              {asking.paid && (
                <div className="ad-field">
                  <label htmlFor={paidId}>المبلغ المدفوع (₪)</label>
                  <input
                    id={paidId}
                    name="paid"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9٠-٩]*"
                    maxLength={5}
                    defaultValue={b.price_ils}
                    dir="ltr"
                    autoComplete="off"
                    required
                  />
                  <span className="ad-field__hint">سعر الخدمة {formatPrice(b.price_ils)}. غيّره إن دفع غير ذلك.</span>
                </div>
              )}
              {asking.reason && (
                <div className="ad-field">
                  <label htmlFor={noteId}>السبب (يظهر للزبون)</label>
                  <textarea id={noteId} name="note" rows={2} maxLength={300} required />
                </div>
              )}
              <div className="ad-form-actions">
                <button type="submit" name="status" value={asking.to} className="ad-btn ad-btn--primary" disabled={pending}>
                  {pending ? "جارٍ الحفظ…" : asking.paid ? "سجّل الحضور" : `نعم، ${asking.label}`}
                </button>
                <button type="button" className="ad-btn ad-btn--ghost" onClick={() => setAsking(null)} disabled={pending}>
                  تراجع
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.moveGrid}>
              {moves.map((m) =>
                m.ask || m.paid ? (
                  <button
                    key={m.to}
                    type="button"
                    className={`ad-btn ${m.paid ? "ad-btn--primary" : "ad-btn--ghost"}`}
                    onClick={() => setAsking(m)}
                    disabled={pending}
                  >
                    {m.label}
                  </button>
                ) : (
                  <button key={m.to} type="submit" name="status" value={m.to} className="ad-btn ad-btn--primary" disabled={pending}>
                    {pending ? "جارٍ الحفظ…" : m.label}
                  </button>
                ),
              )}
            </div>
          )}
          <Result state={state} />
        </form>
      )}
      {b.status === "completed" && <PaidForm booking={b} onDone={onDone} />}
      {b.status === "confirmed" && !started && <p className={styles.muted}>«حضر» و«لم يحضر» يظهران عند وقت الموعد.</p>}

      {remind && (b.status === "confirmed" || b.status === "pending") && (
        <a className="ad-btn ad-btn--ghost ad-btn--block" href={remind} target="_blank" rel="noopener noreferrer">
          ذكّره على واتساب
        </a>
      )}
    </div>
  );
}

/** «عدّل المبلغ»: the amount paid for a completed visit, changed afterwards (filled with what is saved). */
function PaidForm({ booking: b, onDone }: { booking: DayBooking; onDone: (m: string) => void }) {
  const [state, action, pending] = useSheetAction(setBookingPaid, onDone);
  const [open, setOpen] = useState(false);
  const paidId = useId();
  if (!open) {
    return (
      <button type="button" className="ad-btn ad-btn--ghost ad-btn--block" onClick={() => setOpen(true)}>
        عدّل المبلغ المدفوع
      </button>
    );
  }
  return (
    <form action={action} className={styles.sheetStack}>
      <input type="hidden" name="bookingId" value={b.id} />
      <div className="ad-field">
        <label htmlFor={paidId}>المبلغ المدفوع (₪)</label>
        <input
          id={paidId}
          name="paid"
          type="text"
          inputMode="numeric"
          pattern="[0-9٠-٩]*"
          maxLength={5}
          defaultValue={b.paid_ils ?? b.price_ils}
          dir="ltr"
          autoComplete="off"
          required
        />
        <span className="ad-field__hint">سعر الخدمة {formatPrice(b.price_ils)}. يُحفظ التعديل في سجل الموعد.</span>
      </div>
      <div className="ad-form-actions">
        <button type="submit" className="ad-btn ad-btn--primary" disabled={pending}>
          {pending ? "جارٍ الحفظ…" : "احفظ المبلغ"}
        </button>
        <button type="button" className="ad-btn ad-btn--ghost" onClick={() => setOpen(false)} disabled={pending}>
          تراجع
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

function ClosureDetails({ closure: c, label, barberName, onDone }: Props & { closure: DayClosure; label?: string }) {
  const [state, action, pending] = useSheetAction(deleteClosure, onDone);
  return (
    <form action={action} className={styles.sheetStack}>
      <input type="hidden" name="closureId" value={c.id} />
      <p className={styles.question}>
        {label ?? `${formatSlot(c.starts_at)} – ${formatSlot(c.ends_at)}`} · {barberName(c.barber_id)}
        {c.weekly ? " · كل أسبوع" : ""}
        {c.reason ? ` · ${c.reason}` : ""}
      </p>
      {c.weekly && <p className={styles.muted}>فتحه يفتح هذا الوقت في كل الأسابيع.</p>}
      <Result state={state} />
      <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={pending}>
        {pending ? "جارٍ الفتح…" : "افتح الوقت"}
      </button>
    </form>
  );
}

function FlagForm({ userId, name, onDone }: Props & { userId: string; name: string }) {
  const [state, action, pending] = useSheetAction(clearFlag, onDone);
  const noteId = useId();
  return (
    <form action={action} className={styles.sheetStack}>
      <input type="hidden" name="userId" value={userId} />
      <p className={styles.question}>بعد رفع الوسم عن {name} تُثبَّت مواعيده الجديدة فوراً. يُسجَّل اسمك ووقت الرفع.</p>
      <div className="ad-field">
        <label htmlFor={noteId}>ملاحظة (اختياري)</label>
        <textarea id={noteId} name="note" rows={2} maxLength={300} placeholder="اتصل واعتذر…" />
      </div>
      <Result state={state} />
      <button type="submit" className="ad-btn ad-btn--primary ad-btn--block" disabled={pending}>
        {pending ? "جارٍ الرفع…" : "ارفع الوسم"}
      </button>
    </form>
  );
}
