"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useSiteSession } from "@/components/session/session-store";
import { formatPrice } from "@/lib/format";
import { PhoneField, initialPhoneValue, type PhoneValue } from "@/components/PhoneField";
import { BOOKING_STATUS, dayChip, formatSlot, formatWhen, type AvailabilityDay, type PlacedBooking } from "@/lib/bookings";
import type { BookingError } from "@/app/api/bookings/route";
import { whatsappChatUrl } from "@/lib/whatsapp";
import styles from "./booking.module.css";

type Service = { id: string; name_ar: string; price_ils: number; duration_min: number };
type Barber = { id: string; name_ar: string };

type Props = {
  services: Service[];
  barbers: Barber[];
  /** From ?service=&barber=&at= (the sign-in detour); read on the client, see BookingFromUrl. */
  initial: { service?: string; barber?: string; at?: string };
};

/**
 * The last availability answer, tagged with what it was for (`key` = service|barber|reload count). While the current
 * choice has no answer yet, the step shows «جارٍ التحميل». `at`: when the days were loaded, for «اليوم» / «بكرا».
 */
type Slots = { key: string; kind: "error" } | { key: string; kind: "ready"; days: AvailabilityDay[]; at: Date };

type Phase =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string; signIn?: boolean; contact?: boolean }
  | { kind: "done"; booking: PlacedBooking };

const KEY_STORE = "adli-booking-key";

/** One idempotency key per choice (service, barber, time): a double press or a retry reuses it. */
function bookingKey(sig: string) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY_STORE) ?? "null");
    if (saved?.sig === sig && typeof saved.key === "string") return saved.key as string;
    const key = crypto.randomUUID();
    sessionStorage.setItem(KEY_STORE, JSON.stringify({ sig, key }));
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

function forgetBookingKey() {
  try {
    sessionStorage.removeItem(KEY_STORE);
  } catch {}
}

/** Why a day can't be chosen, or null. */
function dayBlocked(d: AvailabilityDay): string | null {
  if (d.closed) return "مغلق";
  if (d.mine) return "عندك موعد";
  if (d.slots.length === 0) return "ممتلئ";
  return null;
}

const durationLabel = (min: number) => `${min} دقيقة`;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function BookingFlow({ services, barbers, initial }: Props) {
  // The session comes from the client store (the page is the same for everyone); null while it loads.
  const session = useSiteSession();
  const known = session.status === "ready" ? session : null;
  const signedIn = Boolean(known?.user);
  const [serviceId, setServiceId] = useState(() => services.find((s) => s.id === initial.service)?.id ?? null);
  const [barberId, setBarberId] = useState(() => barbers.find((b) => b.id === initial.barber)?.id ?? null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slots | null>(null);
  const [reloads, setReloads] = useState(0);
  // null = not typed yet: show the profile's value, which may arrive after the first render.
  const [nameInput, setName] = useState<string | null>(null);
  const [phoneInput, setPhone] = useState<PhoneValue | null>(null);
  const name = nameInput ?? known?.profile?.full_name ?? known?.user?.name ?? "";
  const phone = phoneInput ?? initialPhoneValue(known?.profile?.phone);
  const [nameError, setNameError] = useState(false);
  const [phoneError, setPhoneError] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const wantedAt = useRef(initial.at ?? null);
  const confirmRef = useRef<HTMLElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const ids = { name: useId(), phone: useId(), nameErr: useId(), phoneErr: useId() };

  const service = services.find((s) => s.id === serviceId) ?? null;
  const barber = barbers.find((b) => b.id === barberId) ?? null;
  const slotsKey = serviceId && barberId ? `${serviceId}|${barberId}|${reloads}` : null;
  const current = slots && slots.key === slotsKey ? slots : null;
  const ready = current?.kind === "ready" ? current : null;
  const days = ready?.days ?? null;
  const chosenDay = days?.find((d) => d.day === day) ?? null;

  const reload = () => setReloads((n) => n + 1);

  useEffect(() => {
    if (!serviceId || !barberId) return;
    const key = `${serviceId}|${barberId}|${reloads}`;
    let live = true;
    // Free times are never cached: asked on every choice. supabase-js loads here, not with the page.
    import("@/lib/supabase/client")
      .then(({ createClient }) => createClient().rpc("booking_availability", { p_service_id: serviceId, p_barber_id: barberId }))
      .then(({ data, error }) => {
        if (!live) return;
        if (error) {
          setSlots({ key, kind: "error" });
          return;
        }
        const loaded = data as AvailabilityDay[];
        setSlots({ key, kind: "ready", days: loaded, at: new Date() });

        // Keep the day and time when they're still free; a time from the sign-in detour (?at=) is used once.
        const at = wantedAt.current;
        wantedAt.current = null;
        const atDay = at ? loaded.find((d) => d.slots.includes(at) && !dayBlocked(d)) : undefined;
        setDay((cur) => {
          if (atDay) return atDay.day;
          const still = loaded.find((d) => d.day === cur && !dayBlocked(d));
          return still ? still.day : (loaded.find((d) => !dayBlocked(d))?.day ?? null);
        });
        setSlot((cur) => {
          if (atDay && at) return at;
          return cur && loaded.some((d) => d.slots.includes(cur)) ? cur : null;
        });
      })
      .catch(() => {
        // The client chunk didn't load (connection): same message as a failed read, with «أعد المحاولة».
        if (live) setSlots({ key, kind: "error" });
      });
    return () => {
      live = false;
    };
  }, [serviceId, barberId, reloads]);

  useEffect(() => {
    if (phase.kind === "done") doneRef.current?.focus();
  }, [phase.kind]);

  function chooseService(id: string) {
    setServiceId(id);
    setSlot(null);
    if (phase.kind === "error") setPhase({ kind: "idle" });
  }

  function chooseBarber(id: string) {
    setBarberId(id);
    setSlot(null);
    if (phase.kind === "error") setPhase({ kind: "idle" });
  }

  function chooseDay(d: string) {
    setDay(d);
    setSlot(null);
    if (phase.kind === "error") setPhase({ kind: "idle" });
  }

  function chooseSlot(iso: string) {
    setSlot(iso);
    if (phase.kind === "error") setPhase({ kind: "idle" });
    // On a phone the summary is below the fold: bring it up once a time is chosen.
    requestAnimationFrame(() => confirmRef.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }));
  }

  const signInHref = useMemo(() => {
    const q = new URLSearchParams();
    if (serviceId) q.set("service", serviceId);
    if (barberId) q.set("barber", barberId);
    if (slot) q.set("at", slot);
    const back = `/booking${q.size ? `?${q}` : ""}`;
    return `/login?next=${encodeURIComponent(back)}`;
  }, [serviceId, barberId, slot]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (phase.kind === "sending" || !service || !barber || !slot) return;

    const trimmed = name.trim();
    const mobile = phone.valid ? phone.value : null;
    setNameError(!trimmed);
    setPhoneError(!mobile);
    if (!trimmed) return document.getElementById(ids.name)?.focus();
    if (!mobile) return document.getElementById(ids.phone)?.focus();

    setPhase({ kind: "sending" });
    let res: Response;
    try {
      res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: bookingKey(`${service.id}|${barber.id}|${slot}`),
          serviceId: service.id,
          barberId: barber.id,
          startsAt: slot,
          name: trimmed,
          phone: mobile,
        }),
      });
    } catch {
      setPhase({ kind: "error", message: "لا يوجد اتصال بالإنترنت. تأكد من الاتصال ثم ثبّت الموعد من جديد." });
      return;
    }

    if (res.ok) {
      forgetBookingKey();
      setPhase({ kind: "done", booking: (await res.json()) as PlacedBooking });
      return;
    }

    const body = (await res.json().catch(() => ({ error: "failed" }))) as BookingError;
    switch (body.error) {
      case "slot_taken":
        setSlot(null);
        reload();
        setPhase({ kind: "error", message: "هذا الموعد حُجز للتو، اختر وقتاً آخر." });
        break;
      case "outside_window":
        setSlot(null);
        reload();
        setPhase({ kind: "error", message: "هذا الوقت لم يعد متاحاً: الحجز قبل الموعد بساعة على الأقل. اختر وقتاً آخر." });
        break;
      case "daily_limit":
        setSlot(null);
        reload();
        setPhase({ kind: "error", message: "عندك موعد في هذا اليوم. موعد واحد في اليوم لكل حساب، فاختر يوماً آخر." });
        break;
      case "rate_limited":
        setPhase({ kind: "error", message: "حجزت مرات كثيرة خلال ساعة. حاول مرة أخرى بعد قليل." });
        break;
      case "blocked":
        setPhase({ kind: "error", message: "لا يمكن الحجز من حسابك الآن.", contact: true });
        break;
      case "not_bookable":
        setPhase({ kind: "error", message: "هذه الخدمة أو هذا الحلاق لم يعد متاحاً للحجز. حدّث الصفحة واختر من جديد." });
        break;
      case "sign_in":
        setPhase({ kind: "error", message: "انتهت جلستك. سجّل الدخول من جديد لتثبيت الموعد.", signIn: true });
        break;
      case "invalid":
        if (body.field === "name") {
          setNameError(true);
          setPhase({ kind: "idle" });
        } else if (body.field === "phone") {
          setPhoneError(true);
          setPhase({ kind: "idle" });
        } else {
          setPhase({ kind: "error", message: "في الاختيار شيء غير صحيح. حدّث الصفحة واختر من جديد." });
        }
        break;
      default:
        setPhase({ kind: "error", message: "تعذّر تثبيت الموعد الآن. حاول مرة أخرى بعد قليل." });
    }
  }

  if (phase.kind === "done") {
    const b = phase.booking;
    const pending = b.status === "pending";
    return (
      <div className={styles.done} ref={doneRef} tabIndex={-1} role="status">
        <h2 className="title">{pending ? "وصل طلب موعدك" : "تم تثبيت موعدك"}</h2>
        <dl className={styles.summary}>
          <div>
            <dt>رقم الحجز</dt>
            <dd dir="ltr">{b.code}</dd>
          </div>
          <div>
            <dt>الخدمة</dt>
            <dd>{b.service_name_ar}</dd>
          </div>
          <div>
            <dt>الحلاق</dt>
            <dd>{b.barber_name_ar}</dd>
          </div>
          <div>
            <dt>الموعد</dt>
            <dd>{formatWhen(b.starts_at)}</dd>
          </div>
          <div>
            <dt>السعر</dt>
            <dd>{formatPrice(b.price_ils)}، يُدفع في الصالون</dd>
          </div>
        </dl>
        <p className={styles.note}>
          {pending
            ? `${BOOKING_STATUS.pending}: على حسابك وسم «تخلّف عن موعد»، فيؤكد الصالون مواعيدك الجديدة بنفسه. ستجد الحالة في حسابك.`
            : "ستجد موعدك في حسابك، وتقدر تلغيه من هناك حتى ساعتين قبل الموعد."}
        </p>
        <Link className="ad-btn ad-btn--primary ad-btn--block" href="/account#bookings">
          مواعيدي
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.flow}>
      <section className={styles.step} aria-labelledby="step-service">
        <h2 id="step-service" className={styles.stepTitle}>
          <span className={styles.stepNo}>1</span> الخدمة
        </h2>
        <ul className={styles.options}>
          {services.map((s) => (
            <li key={s.id}>
              <button type="button" className={styles.option} aria-pressed={s.id === serviceId} onClick={() => chooseService(s.id)}>
                <span className={styles.optionName}>{s.name_ar}</span>
                <span className={styles.optionMeta}>
                  {durationLabel(s.duration_min)} · {formatPrice(s.price_ils)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {service && (
        <section className={styles.step} aria-labelledby="step-barber">
          <h2 id="step-barber" className={styles.stepTitle}>
            <span className={styles.stepNo}>2</span> الحلاق
          </h2>
          <div className="ad-chips">
            {barbers.map((b) => (
              <button key={b.id} type="button" className="ad-chip" aria-pressed={b.id === barberId} onClick={() => chooseBarber(b.id)}>
                {b.name_ar}
              </button>
            ))}
          </div>
        </section>
      )}

      {service && barber && (
        <section className={styles.step} aria-labelledby="step-day" aria-busy={!current}>
          <h2 id="step-day" className={styles.stepTitle}>
            <span className={styles.stepNo}>3</span> اليوم
          </h2>
          {current?.kind === "error" ? (
            <p className={styles.error} role="alert">
              تعذّر تحميل الأوقات.{" "}
              <button type="button" className={styles.inlineButton} onClick={reload}>
                أعد المحاولة
              </button>
            </p>
          ) : !ready ? (
            <p className={styles.hint}>جارٍ تحميل الأيام…</p>
          ) : (
            <div className={styles.dayStrip}>
              <ul>
                {ready.days.map((d) => {
                  const label = dayChip(d.day, ready.at);
                  const blocked = dayBlocked(d);
                  return (
                    <li key={d.day}>
                      <button
                        type="button"
                        className={styles.day}
                        aria-pressed={d.day === day}
                        disabled={Boolean(blocked)}
                        onClick={() => chooseDay(d.day)}
                      >
                        <span className={styles.dayName}>{label.name}</span>
                        <span className={styles.dayDate}>{blocked ?? label.date}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {service && barber && chosenDay && (
        <section className={styles.step} aria-labelledby="step-time">
          <h2 id="step-time" className={styles.stepTitle}>
            <span className={styles.stepNo}>4</span> الوقت
          </h2>
          <div className="ad-chips">
            {chosenDay.slots.map((iso) => (
              <button key={iso} type="button" className={`ad-chip ${styles.time}`} aria-pressed={iso === slot} onClick={() => chooseSlot(iso)}>
                {formatSlot(iso)}
              </button>
            ))}
          </div>
          <p className={styles.hint}>
            {service.name_ar} تأخذ {durationLabel(service.duration_min)}. الأوقات المعروضة متاحة الآن.
          </p>
        </section>
      )}

      {service && barber && slot && (
        <section className={styles.step} aria-labelledby="step-confirm" ref={confirmRef}>
          <h2 id="step-confirm" className={styles.stepTitle}>
            <span className={styles.stepNo}>5</span> التأكيد
          </h2>
          <dl className={styles.summary}>
            <div>
              <dt>الخدمة</dt>
              <dd>{service.name_ar}</dd>
            </div>
            <div>
              <dt>الحلاق</dt>
              <dd>{barber.name_ar}</dd>
            </div>
            <div>
              <dt>الموعد</dt>
              <dd>{formatWhen(slot)}</dd>
            </div>
            <div>
              <dt>السعر</dt>
              <dd>{formatPrice(service.price_ils)}، يُدفع في الصالون</dd>
            </div>
          </dl>

          {!known ? null : !signedIn ? (
            <div className={styles.signIn}>
              <p>الحجز يحتاج حساباً، حتى ترى موعدك وتلغيه إذا احتجت. سجّل الدخول وارجع لنفس الاختيار.</p>
              <Link className="ad-btn ad-btn--primary ad-btn--block" href={signInHref}>
                سجّل الدخول لتثبيت الموعد
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <div className="ad-field">
                <label htmlFor={ids.name}>الاسم</label>
                <input
                  id={ids.name}
                  autoComplete="name"
                  maxLength={80}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError && e.target.value.trim()) setNameError(false);
                  }}
                  aria-invalid={nameError || undefined}
                  aria-describedby={nameError ? ids.nameErr : undefined}
                  required
                />
                {nameError && (
                  <span className="ad-field__error" id={ids.nameErr}>
                    اكتب اسمك ليُسجَّل الموعد باسمك
                  </span>
                )}
              </div>
              <div className="ad-field">
                <label htmlFor={ids.phone}>رقم الجوال</label>
                {/* key: the saved number fills the field once the session arrives (it can come after the first render). */}
                <PhoneField
                  key={known?.profile?.phone ?? ""}
                  id={ids.phone}
                  defaultPhone={known?.profile?.phone}
                  onChange={(v) => {
                    setPhone(v);
                    if (phoneError) setPhoneError(false);
                  }}
                  invalid={phoneError}
                  describedBy={phoneError ? ids.phoneErr : undefined}
                  required
                />
                {phoneError && (
                  <span className="ad-field__error" id={ids.phoneErr}>
                    اكتب رقم الجوال: 9 أرقام تبدأ بـ 5، واختر المقدمة +970 أو +972
                  </span>
                )}
              </div>

              {phase.kind === "error" && (
                <p className={styles.error} role="alert">
                  {phase.message}
                  {phase.signIn && (
                    <>
                      {" "}
                      <Link href={signInHref}>سجّل الدخول</Link>
                    </>
                  )}
                  {phase.contact && (
                    <>
                      {" "}
                      <a href={whatsappChatUrl()} target="_blank" rel="noopener noreferrer">
                        تواصل مع الصالون
                      </a>
                    </>
                  )}
                </p>
              )}

              <button className="ad-btn ad-btn--primary ad-btn--block" type="submit" disabled={phase.kind === "sending"}>
                {phase.kind === "sending" ? "جارٍ تثبيت الموعد…" : "ثبّت الموعد"}
              </button>
              <p className={styles.note}>الاسم والجوال يُحفظان في حسابك لموعدك القادم.</p>
            </form>
          )}
        </section>
      )}

      {phase.kind === "error" && !slot && (
        <p className={styles.error} role="alert">
          {phase.message}
        </p>
      )}
    </div>
  );
}

const one = (v: string | null) => v ?? undefined;

/**
 * BookingFlow with the choice carried through the sign-in detour (?service=&barber=&at=). Search params are only
 * known per request, so the page renders this inside <Suspense> with a plain <BookingFlow> as the fallback:
 * the prerendered page shows the flow at once, and the URL's choice applies on the client.
 */
export function BookingFromUrl(props: Omit<Props, "initial">) {
  const sp = useSearchParams();
  return <BookingFlow {...props} initial={{ service: one(sp.get("service")), barber: one(sp.get("barber")), at: one(sp.get("at")) }} />;
}
