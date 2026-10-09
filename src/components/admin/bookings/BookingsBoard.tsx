"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { DAY_NAMES, type Weekday } from "@/lib/salon";
import { addDays, dayChip, formatSlot, formatWhen, minutesToHHMM, salonDate, salonMinutes } from "@/lib/bookings";
import { ADMIN_STATUS_LABEL, ON_CALENDAR, reminderUrl, type BookingDay, type DayBooking, type DayClosure, type UpcomingDay } from "@/lib/admin/bookings";
import { formatTime } from "@/lib/salon";
import { BookingSheet, type SheetState } from "./BookingSheet";
import styles from "./bookings.module.css";
import { formatDate, formatDayMonth } from "@/lib/dates";

export type PendingBooking = {
  id: string;
  code: string;
  starts_at: string;
  customer_name: string | null;
  service_name_ar: string;
  barber_name_ar: string;
};

export type WeeklyClosure = {
  id: string;
  barber_id: string | null;
  weekday: Weekday;
  start_time: string;
  end_time: string;
  valid_from: string;
  valid_until: string | null;
  reason: string | null;
  barbers: { name_ar: string } | null;
};

export type OpenFlag = {
  user_id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  flagged_at: string;
  booking_code: string | null;
};

export type Service = { id: string; name_ar: string; duration_min: number };

type Props = {
  data: BookingDay;
  today: string;
  /** The 7 days from today, each with its count and whether the salon is closed (admin_upcoming_bookings). */
  week: UpcomingDay[];
  /** Bookings new to me since my last visit: they carry «جديد». */
  newIds: string[];
  isOwner: boolean;
  pending: PendingBooking[];
  services: Service[];
  weekly: WeeklyClosure[];
  flags: OpenFlag[];
};

/** 3px a minute: a 15-minute booking is 45px, a comfortable tap. */
const PX = 3;
const STEP = 15;

// "Now" is only known in the browser; the server renders without the line (no hydration mismatch).
const subscribe = (onChange: () => void) => {
  const id = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(id);
};
const currentMinute = () => Math.floor(Date.now() / 60_000);
const noMinute = () => null;


/**
 * The day for the whole salon: one column per barber, bookings and closed times on a timeline. Built for a phone in
 * one hand: tap an empty quarter-hour to seat someone or close it, tap a booking to act on it.
 */
export function BookingsBoard({ data, today, week, newIds, isOwner, pending, services, weekly, flags }: Props) {
  const isNew = new Set(newIds);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const minute = useSyncExternalStore(subscribe, currentMinute, noMinute);

  const myBarber = data.barbers.find((b) => b.mine) ?? null;
  const canClose = (barberId: string | null) => isOwner || (barberId !== null && barberId === myBarber?.id);
  const closable = isOwner ? data.barbers.filter((b) => b.is_active) : myBarber ? [myBarber] : [];
  const barberName = (id: string | null) => (id ? (data.barbers.find((b) => b.id === id)?.name_ar ?? "حلاق") : "الصالون كله");

  const onCalendar = data.bookings.filter((b) => ON_CALENDAR.includes(b.status));
  const active = data.bookings.filter((b) => b.status === "pending" || b.status === "confirmed");

  // The timeline: the day's hours, stretched to anything booked or closed outside them.
  const marks = [
    ...onCalendar.flatMap((b) => [salonMinutes(b.starts_at), salonMinutes(b.ends_at) || 24 * 60]),
    ...data.closures.map((c) => salonMinutes(c.starts_at)),
  ];
  const open = Math.min(data.hours ? toMin(data.hours.open) : 24 * 60, ...marks);
  const close = Math.max(data.hours ? toMin(data.hours.close) : 0, ...onCalendar.map((b) => salonMinutes(b.ends_at) || 24 * 60));
  const hasGrid = close > open;
  const start = Math.floor(open / 60) * 60;
  const end = Math.ceil(close / 60) * 60;
  const height = (end - start) * PX;

  const isToday = data.day === today;
  const nowMin = isToday && minute !== null ? salonMinutes(new Date(minute * 60_000).toISOString()) : null;

  // «زبون الآن»: today, the next 5 minutes; another day, the opening time.
  const walkInStart = () => {
    if (isToday && minute !== null) return Math.ceil(salonMinutes(new Date(minute * 60_000).toISOString()) / 5) * 5;
    return data.hours ? toMin(data.hours.open) : 12 * 60;
  };

  const done = (message: string) => {
    setSheet(null);
    setFlash(message);
  };

  const label = dayChip(data.day, new Date(`${today}T12:00:00Z`));

  return (
    <main className={styles.page}>
      <div className={styles.head}>
        <h1 className="title">المواعيد</h1>
        <nav className={styles.dayNav} aria-label="اليوم">
          <Link className={styles.navArrow} href={`/admin/bookings?day=${addDays(data.day, -1)}`} aria-label="اليوم السابق">
            ‹
          </Link>
          <Link className={styles.navArrow} href={`/admin/bookings?day=${addDays(data.day, 1)}`} aria-label="اليوم التالي">
            ›
          </Link>
          <form className={styles.datePick} action="/admin/bookings">
            <label className="sr-only" htmlFor="day-pick">
              اذهب إلى يوم
            </label>
            <input id="day-pick" type="date" name="day" defaultValue={data.day} />
            <button type="submit" className="ad-btn ad-btn--ghost">
              اذهب
            </button>
          </form>
        </nav>
        {/* The next 7 days: each with its bookings count; a day the salon is closed says so. */}
        <nav className={styles.week} aria-label="الأيام السبعة القادمة">
          {week.map((d) => {
            const chip = dayChip(d.day, new Date(`${today}T12:00:00Z`));
            const count = d.count > 0 ? `${d.count} ${d.count === 1 ? "موعد" : d.count === 2 ? "موعدان" : "مواعيد"}` : "";
            return (
              <Link
                key={d.day}
                className={styles.weekDay}
                href={`/admin/bookings?day=${d.day}`}
                aria-current={d.day === data.day ? "page" : undefined}
                data-closed={d.closed || undefined}
                aria-label={[chip.name, chip.date, d.closed ? "مغلق" : count || "لا مواعيد", d.new ? `${d.new} جديد` : ""].filter(Boolean).join("، ")}
              >
                <span className={styles.weekName}>{chip.name}</span>
                <span className={styles.weekDate}>{chip.date.split(" ")[0]}</span>
                {d.closed ? (
                  <span className={styles.weekClosed}>مغلق</span>
                ) : d.count > 0 ? (
                  <span className={styles.weekCount} data-new={d.new > 0 || undefined}>
                    {d.count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <p className={styles.dayTitle}>
          {label.name === "اليوم" || label.name === "بكرا" ? `${label.name}، ` : ""}
          {formatDayMonth(new Date(`${data.day}T12:00:00Z`), { timeZone: "UTC", weekday: true })}
          {data.hours ? ` · ${formatTime(data.hours.open)} – ${formatTime(data.hours.close)}` : " · الصالون مغلق"}
        </p>
      </div>

      <p className="ad-notice ad-notice--ok" role="status">
        {flash ?? ""}
      </p>

      <div className={styles.quick}>
        <button
          type="button"
          className="ad-btn ad-btn--primary"
          onClick={() => setSheet({ kind: "walkin", barberId: myBarber?.id ?? data.barbers.find((b) => b.is_active)?.id ?? null, start: walkInStart() })}
        >
          زبون بدون موعد
        </button>
        {closable.length > 0 && (
          <button
            type="button"
            className="ad-btn ad-btn--ghost"
            onClick={() => setSheet({ kind: "close", barberId: myBarber?.id ?? closable[0].id, start: walkInStart() })}
          >
            سكّر وقت
          </button>
        )}
      </div>

      {pending.length > 0 && (
        <section className={styles.panel} aria-labelledby="pending-title">
          <h2 id="pending-title" className={styles.h2}>
            بانتظار تأكيدك <span className="ad-attention">{pending.length}</span>
          </h2>
          <ul className={styles.rows}>
            {pending.map((p) => (
              <li key={p.id}>
                <Link className={styles.row} href={`/admin/bookings?day=${salonDate(new Date(p.starts_at))}#b-${p.id}`}>
                  <span>
                    <strong>{formatWhen(p.starts_at)}</strong>
                    <span className={styles.rowMeta}>
                      {p.customer_name ?? "زبون"} · {p.service_name_ar} · {p.barber_name_ar}
                    </span>
                  </span>
                  <span className={styles.rowCode} dir="ltr">
                    {p.code}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!hasGrid ? (
        <p className={styles.closed}>الصالون مغلق هذا اليوم، ولا مواعيد فيه.</p>
      ) : (
        <div className={styles.calendar} style={{ ["--cols" as string]: data.barbers.length }}>
          <div className={styles.calHead} aria-hidden="true">
            <span />
            {data.barbers.map((b) => (
              <span key={b.id} className={styles.calBarber} data-mine={b.mine || undefined}>
                {b.name_ar}
                {b.mine ? " (أنت)" : ""}
              </span>
            ))}
          </div>
          <div className={styles.calBody} style={{ height }}>
            <div className={styles.gutter}>
              {Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60).map((m) => (
                <span key={m} className={styles.hour} style={{ insetBlockStart: (m - start) * PX }}>
                  {formatTime(minutesToHHMM(m % (24 * 60))).replace(/ (صباحاً|ظهراً|مساءً)/, "")}
                </span>
              ))}
            </div>
            {data.barbers.map((b) => (
              <div key={b.id} className={styles.column} role="group" aria-label={`مواعيد ${b.name_ar}`}>
                {Array.from({ length: (end - start) / STEP }, (_, i) => start + i * STEP).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={styles.cell}
                    style={{ insetBlockStart: (m - start) * PX, blockSize: STEP * PX }}
                    data-hour={m % 60 === 0 || undefined}
                    aria-label={`${formatTime(minutesToHHMM(m))} مع ${b.name_ar}`}
                    onClick={() => setSheet({ kind: "slot", barberId: b.id, start: m })}
                  />
                ))}
                {data.closures
                  .filter((c) => c.barber_id === null || c.barber_id === b.id)
                  .map((c) => (
                    <ClosureBlock
                      key={`${c.id}-${b.id}`}
                      closure={c}
                      start={start}
                      onOpen={canClose(c.barber_id) ? () => setSheet({ kind: "closure", closure: c }) : undefined}
                    />
                  ))}
                {onCalendar
                  .filter((x) => x.barber_id === b.id)
                  .map((x) => (
                    <BookingBlock key={x.id} booking={x} start={start} isNew={isNew.has(x.id)} onOpen={() => setSheet({ kind: "booking", booking: x })} />
                  ))}
                {nowMin !== null && nowMin >= start && nowMin <= end && (
                  <span className={styles.now} style={{ insetBlockStart: (nowMin - start) * PX }} aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <section className={styles.panel} aria-labelledby="remind-title">
        <h2 id="remind-title" className={styles.h2}>
          للتذكير على واتساب
        </h2>
        {active.length === 0 ? (
          <p className={styles.muted}>لا مواعيد قائمة في هذا اليوم.</p>
        ) : (
          <ul className={styles.rows}>
            {active.map((b) => {
              const url = reminderUrl(b, barberName(b.barber_id));
              return (
                <li key={b.id} id={`b-${b.id}`} className={styles.remind}>
                  <button type="button" className={styles.rowButton} onClick={() => setSheet({ kind: "booking", booking: b })}>
                    <strong>
                      {formatSlot(b.starts_at)} · {b.customer_name ?? "بدون اسم"}
                    </strong>
                    <span className={styles.rowMeta}>
                      {b.service_name_ar} · {barberName(b.barber_id)}
                      {b.status === "pending" ? " · بانتظار التأكيد" : ""}
                    </span>
                  </button>
                  {url ? (
                    <a className="ad-btn ad-btn--ghost" href={url} target="_blank" rel="noopener noreferrer">
                      ذكّره
                    </a>
                  ) : (
                    <span className={styles.muted}>بلا رقم</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="weekly-title">
        <h2 id="weekly-title" className={styles.h2}>
          أوقات مسكّرة كل أسبوع
        </h2>
        {weekly.length === 0 ? (
          <p className={styles.muted}>لا استراحات متكررة. أضفها من «سكّر وقت» واختر «كل أسبوع».</p>
        ) : (
          <ul className={styles.rows}>
            {weekly.map((w) => (
              <li key={w.id} className={styles.remind}>
                <span>
                  <strong>
                    {DAY_NAMES[w.weekday]} {formatTime(w.start_time.slice(0, 5))} – {formatTime(w.end_time.slice(0, 5))}
                  </strong>
                  <span className={styles.rowMeta}>
                    {w.barbers?.name_ar ?? "الصالون كله"}
                    {w.reason ? ` · ${w.reason}` : ""}
                    {w.valid_until ? ` · حتى ${w.valid_until}` : ""}
                  </span>
                </span>
                {canClose(w.barber_id) && (
                  <button
                    type="button"
                    className="ad-btn ad-btn--ghost"
                    onClick={() =>
                      setSheet({
                        kind: "closure",
                        closure: { id: w.id, barber_id: w.barber_id, weekly: true, reason: w.reason, starts_at: "", ends_at: "" },
                        label: `${DAY_NAMES[w.weekday]} ${formatTime(w.start_time.slice(0, 5))} – ${formatTime(w.end_time.slice(0, 5))}`,
                      })
                    }
                  >
                    افتحه
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {flags.length > 0 && (
        <section className={styles.panel} aria-labelledby="flags-title">
          <h2 id="flags-title" className={styles.h2}>
            وسم «تخلّف عن موعد» <span className="ad-attention">{flags.length}</span>
          </h2>
          <p className={styles.muted}>مواعيد هذه الحسابات تنتظر تأكيدك حتى ترفع الوسم.</p>
          <ul className={styles.rows}>
            {flags.map((f) => (
              <li key={f.user_id} className={styles.remind}>
                <span>
                  <Link href={`/admin/customers/${f.user_id}`}>
                    <strong>{f.full_name ?? f.email}</strong>
                  </Link>
                  <span className={styles.rowMeta}>
                    منذ {formatDate(f.flagged_at)}
                    {f.booking_code ? ` · ${f.booking_code}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className="ad-btn ad-btn--ghost"
                  onClick={() => setSheet({ kind: "flag", userId: f.user_id, name: f.full_name ?? f.email })}
                >
                  ارفع الوسم
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BookingSheet
        state={sheet}
        onClose={() => setSheet(null)}
        onSwitch={setSheet}
        onDone={done}
        nowMs={minute === null ? null : minute * 60_000}
        day={data.day}
        barbers={data.barbers}
        closable={closable}
        isOwner={isOwner}
        services={services}
        barberName={barberName}
        canClose={canClose}
        statusLabel={ADMIN_STATUS_LABEL}
      />
    </main>
  );
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function BookingBlock({ booking: b, start, isNew, onOpen }: { booking: DayBooking; start: number; isNew: boolean; onOpen: () => void }) {
  const from = salonMinutes(b.starts_at);
  const to = salonMinutes(b.ends_at) || 24 * 60;
  return (
    <button
      type="button"
      className={styles.booking}
      data-status={b.status}
      style={{ insetBlockStart: (from - start) * PX, blockSize: Math.max((to - from) * PX - 2, 20) }}
      onClick={onOpen}
    >
      <span className={styles.bTime}>
        {formatSlot(b.starts_at)}
        {isNew && <span className={styles.bNew}>جديد</span>}
      </span>
      <span className={styles.bName}>{b.customer_name ?? (b.kind === "walk_in" ? "بدون موعد" : "زبون")}</span>
      <span className={styles.bMeta}>
        {b.service_name_ar}
        {b.status !== "confirmed" ? ` · ${ADMIN_STATUS_LABEL[b.status]}` : ""}
        {b.flagged ? " · وسم" : ""}
      </span>
    </button>
  );
}

function ClosureBlock({ closure: c, start, onOpen }: { closure: DayClosure; start: number; onOpen?: () => void }) {
  const from = salonMinutes(c.starts_at);
  const to = salonMinutes(c.ends_at) || 24 * 60;
  const style = { insetBlockStart: (Math.max(from, start) - start) * PX, blockSize: Math.max((to - Math.max(from, start)) * PX - 2, 16) };
  const text = (
    <>
      <span className={styles.bName}>مسكّر{c.barber_id === null ? " · الصالون" : ""}</span>
      {c.reason && <span className={styles.bMeta}>{c.reason}</span>}
    </>
  );
  return onOpen ? (
    <button type="button" className={styles.closure} style={style} onClick={onOpen}>
      {text}
    </button>
  ) : (
    <span className={styles.closure} style={style}>
      {text}
    </span>
  );
}
