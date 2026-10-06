"use client";

/*
  Daily sales, last 30 salon days. One series (no legend: the title names it), columns in --brass (checked ≥ 3:1
  against both themes' surfaces), ≤ 24px wide with a 4px rounded top on a single baseline, hairline gridlines.
  Only the best day carries a direct label; every other value is in the tooltip (hover or arrow keys) and the table.
  RTL: the newest day sits at the inline end (the left), like the rest of the page reads.
*/

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { formatPrice } from "@/lib/format";
import styles from "./SalesChart.module.css";

export type DailySales = { day: string; sales: number; orders: number };

const H = 220;
const PAD = { top: 24, bottom: 28, start: 8, end: 52 }; // `end` holds the y-axis labels (right side in RTL)
const BAR_MAX = 24;

const dayFmt = new Intl.DateTimeFormat("ar-PS-u-nu-latn", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

/** A clean top for the axis: 1, 2, 2.5 or 5 × 10^k. */
function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/** A column with a 4px rounded data end and a square foot on the baseline. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

const ordersWord = (n: number) => (n === 0 ? "بلا طلبات" : n === 1 ? "طلب واحد" : n === 2 ? "طلبان" : `${n} طلبات`);

/** «30/9»: built by hand so bidi marks from Intl can't flip it inside the SVG. */
const tick = (d: string) => {
  const date = asDate(d);
  return `${date.getUTCDate()}/${date.getUTCMonth() + 1}`;
};

export function SalesChart({ days }: { days: DailySales[] }) {
  const [active, setActive] = useState<number | null>(null);
  // Drawn at the container's real width (1 unit = 1px), so labels stay 12px on a phone instead of shrinking with a viewBox.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const titleId = useId();
  const n = days.length;
  const max = niceMax(Math.max(...days.map((d) => d.sales), 0));
  const plotW = W - PAD.start - PAD.end;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / n;
  const barW = Math.min(BAR_MAX, slot - 2); // ≥ 2px surface gap between neighbours
  // Newest at the left: index n-1 (today) at the start edge.
  const xOf = (i: number) => PAD.start + (n - 1 - i) * slot + (slot - barW) / 2;
  const yOf = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const best = days.reduce((b, d, i) => (d.sales > (days[b]?.sales ?? -1) ? i : b), 0);
  const total = days.reduce((s, d) => s + d.sales, 0);

  function onKey(e: KeyboardEvent) {
    const step: Record<string, number> = { ArrowLeft: 1, ArrowRight: -1, Home: -n, End: n };
    if (!(e.key in step)) return;
    e.preventDefault();
    setActive((a) => Math.min(n - 1, Math.max(0, (a ?? n - 1) + step[e.key])));
  }

  const a = active !== null ? days[active] : null;

  return (
    <figure className={styles.figure}>
      <figcaption id={titleId} className={styles.title}>
        المبيعات اليومية، آخر {n} يوماً
        <span className={styles.sub}>المجموع {formatPrice(total)}</span>
      </figcaption>

      <div
        ref={box}
        className={styles.plot}
        tabIndex={0}
        role="group"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-hint`}
        onKeyDown={onKey}
        onFocus={() => setActive((x) => x ?? n - 1)}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        <span id={`${titleId}-hint`} className="sr-only">
          استعمل الأسهم للتنقل بين الأيام.
        </span>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={styles.svg} aria-hidden="true">
          {[0, 0.5, 1].map((t) => {
            const y = yOf(max * t);
            return (
              <g key={t}>
                <line x1={PAD.start} x2={W - PAD.end} y1={y} y2={y} className={styles.grid} />
                <text x={W - PAD.end + 6} y={y} className={styles.yLabel} dominantBaseline="middle">
                  {Math.round(max * t).toLocaleString("en-US")}
                </text>
              </g>
            );
          })}
          {days.map((d, i) => {
            const x = xOf(i);
            const y = yOf(d.sales);
            const h = PAD.top + plotH - y;
            return (
              <g key={d.day}>
                {d.sales > 0 && (
                  <path d={columnPath(x, y, barW, h)} className={i === active ? `${styles.bar} ${styles.barActive}` : styles.bar} />
                )}
                {/* The hit target is the whole slot, taller and wider than the bar. */}
                <rect
                  x={PAD.start + (n - 1 - i) * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  className={styles.hit}
                  onPointerEnter={() => setActive(i)}
                />
                {(n - 1 - i) % 7 === 0 && (
                  <text x={x + barW / 2} y={H - 8} className={styles.xLabel} textAnchor="middle">
                    {i === n - 1 ? "اليوم" : tick(d.day)}
                  </text>
                )}
              </g>
            );
          })}
          {days[best]?.sales > 0 && (
            <text x={xOf(best) + barW / 2} y={yOf(days[best].sales) - 6} className={styles.peak} textAnchor="middle">
              {days[best].sales.toLocaleString("en-US")}
            </text>
          )}
        </svg>

        {a && active !== null && (
          <div
            className={styles.tooltip}
            // In RTL the inline end is the left edge, the same origin as the SVG's x axis.
            // Kept off the edges so it never leaves a phone screen on the first or last days.
            style={{ insetInlineEnd: `${Math.min(85, Math.max(15, ((PAD.start + (n - 1 - active) * slot + slot / 2) / W) * 100))}%` }}
            aria-hidden="true"
          >
            <strong>{formatPrice(a.sales)}</strong>
            <span>{ordersWord(a.orders)}</span>
            <span>{dayFmt.format(asDate(a.day))}</span>
          </div>
        )}
        <span className="sr-only" aria-live="polite">
          {a ? `${dayFmt.format(asDate(a.day))}: ${formatPrice(a.sales)}، ${ordersWord(a.orders)}` : ""}
        </span>
      </div>

      <details className={styles.table}>
        <summary>عرض كجدول</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">اليوم</th>
              <th scope="col">المبيعات</th>
              <th scope="col">الطلبات</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.day}>
                <th scope="row">{dayFmt.format(asDate(d.day))}</th>
                <td>{formatPrice(d.sales)}</td>
                <td>{d.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
