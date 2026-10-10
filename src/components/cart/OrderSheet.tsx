"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { useCart } from "@/components/cart/CartContext";
import { Button } from "@/components/Button";
import { WhatsAppIcon } from "@/components/icons";
import { formatPrice, joinAnd } from "@/lib/format";
import { buildOrderMessage, whatsappChatUrl, whatsappUrl, type PlacedOrder } from "@/lib/whatsapp";
import type { CartLine } from "@/lib/cart-store";
import type { OrderError } from "@/app/api/orders/route";
import { PHONE_MESSAGES, phoneProblem } from "@/lib/phone";
import { PhoneField, initialPhoneValue } from "@/components/PhoneField";
import { BrandMark } from "@/components/brand/BrandMark";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The signed-in customer's profile; guests get empty fields. */
  prefill?: { full_name: string | null; area: string | null; phone: string | null } | null;
};

type Phase =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string; contact?: boolean }
  | { kind: "sent"; code: string; url: string };

const KEY_STORE = "adli-checkout-key";

/**
 * One idempotency key per checkout attempt: the same cart reuses it (double press, retry after a
 * network error), a changed cart gets a new one. Kept in sessionStorage so a reload mid-send can't
 * create a second order.
 */
function checkoutKey(lines: CartLine[]) {
  const sig = lines.map((l) => `${l.id}:${l.qty}`).sort().join(",");
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

function forgetCheckoutKey() {
  try {
    sessionStorage.removeItem(KEY_STORE);
  } catch {}
}

/** «طاقية أسود، مقاس L» */
const lineName = (l: CartLine | undefined) => l && (l.variant_name_ar ? `${l.name_ar} ${l.variant_name_ar}` : l.name_ar);

/** Under the name: the variant, then the volume; the unit price when there is neither. */
const lineMeta = (l: CartLine) =>
  [l.variant_name_ar, l.volume_ml ? `${l.volume_ml} مل` : null].filter(Boolean).join("، ") || formatPrice(l.price_ils);


export function OrderSheet({ open, onClose, prefill }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const { lines, total, setQty, clear } = useCart();
  const [name, setName] = useState(prefill?.full_name ?? "");
  const [area, setArea] = useState(prefill?.area ?? "");
  const [phone, setPhone] = useState(() => initialPhoneValue(prefill?.phone));
  const [nameError, setNameError] = useState(false);
  const [phoneError, setPhoneError] = useState(false);
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const ids = { title: useId(), name: useId(), area: useId(), phone: useId(), nameErr: useId(), phoneErr: useId() };

  // Sync the native <dialog> with `open` (showModal gives focus trap, Esc and the top layer).
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const blocked = lines.filter((l) => unavailable.has(l.id));
  const sending = phase.kind === "sending";

  function close() {
    if (phase.kind === "sent") setPhase({ kind: "idle" });
    onClose();
  }

  function onBackdrop(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) close();
  }

  function changeQty(line: CartLine, qty: number) {
    setQty(line.id, qty);
    if (phase.kind === "error") setPhase({ kind: "idle" });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending || blocked.length > 0 || lines.length === 0) return;

    const trimmed = name.trim();
    const phoneOk = !phone.empty && phone.valid;
    setNameError(!trimmed);
    setPhoneError(!phoneOk);
    if (!trimmed) return nameRef.current?.focus();
    if (!phoneOk) return document.getElementById(ids.phone)?.focus();

    setPhase({ kind: "sending" });
    let res: Response;
    try {
      res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: checkoutKey(lines),
          name: trimmed,
          area: area.trim(),
          phone: phone.value,
          items: lines.map((l) => ({ variantId: l.id, qty: l.qty })),
        }),
      });
    } catch {
      setPhase({ kind: "error", message: "لا يوجد اتصال بالإنترنت. تأكد من الاتصال ثم أرسل الطلب من جديد." });
      return;
    }

    if (res.ok) {
      const order = (await res.json()) as PlacedOrder;
      const url = whatsappUrl(buildOrderMessage(order, trimmed, area));
      forgetCheckoutKey();
      clear();
      setUnavailable(new Set());
      setPhase({ kind: "sent", code: order.code, url });
      // Same tab: a window.open() after an await is blocked as a popup on iOS.
      window.location.assign(url);
      return;
    }

    const body = (await res.json().catch(() => ({ error: "failed" }))) as OrderError;
    switch (body.error) {
      case "unavailable": {
        setUnavailable(new Set(body.products.map((p) => p.id)));
        const names = body.products.map(
          (p) => p.name_ar ?? lineName(lines.find((l) => l.id === p.id)) ?? "منتج",
        );
        setPhase({
          kind: "error",
          message: `نفدت كمية ${joinAnd(names)}، احذفه من السلة لتكمل الطلب.`,
        });
        break;
      }
      case "rate_limited":
        setPhase({ kind: "error", message: "أرسلت طلبات كثيرة خلال دقيقة. انتظر دقيقة ثم أرسل الطلب من جديد." });
        break;
      case "blocked":
        setPhase({ kind: "error", message: "لا يمكن الطلب من حسابك الآن.", contact: true });
        break;
      case "invalid":
        if (body.field === "name") {
          setNameError(true);
          nameRef.current?.focus();
          setPhase({ kind: "idle" });
        } else if (body.field === "phone") {
          setPhoneError(true);
          setPhase({ kind: "idle" });
        } else {
          setPhase({ kind: "error", message: "في السلة شيء غير صحيح. احذف المنتجات وأضفها من جديد ثم أرسل الطلب." });
        }
        break;
      default:
        setPhase({ kind: "error", message: "تعذّر إرسال الطلب الآن. حاول مرة أخرى بعد قليل." });
    }
  }

  // Lines that ran out and were removed no longer block sending.
  const stillBlocked = blocked.length > 0;

  return (
    <dialog
      ref={dialogRef}
      className="ad-sheet-dialog"
      aria-labelledby={ids.title}
      onClose={close}
      onClick={onBackdrop}
    >
      <section className="ad-sheet">
        <div className="ad-sheet__grip" aria-hidden="true" />
        <div className="ad-sheet__head">
          <h2 className="ad-sheet__title" id={ids.title}>
            سلة الطلب
          </h2>
          <button type="button" className="ad-sheet__close" onClick={close} aria-label="إغلاق">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {phase.kind === "sent" ? (
          <div className="ad-sheet__done" role="status">
            <p className="body">أُرسل الطلب رقم {phase.code}.</p>
            <p className="ad-sheet__note">إذا لم يُفتح واتساب تلقائياً، افتحه من هنا لإرسال الرسالة.</p>
            <a className="ad-btn ad-btn--whatsapp ad-btn--block" href={phase.url}>
              <WhatsAppIcon />
              افتح واتساب
            </a>
          </div>
        ) : lines.length === 0 ? (
          <div className="ad-sheet__empty">
            <BrandMark kind="bottle" tone="mono" height={48} className="ad-sheet__empty-mark" />
            <p className="body">سلتك فارغة. اختر من الرف، ثم أرسل الطلب على واتساب.</p>
            <Button variant="ghost" href="/products" onClick={close}>
              تصفّح المنتجات
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <ul className="ad-sheet__lines">
              {lines.map((l) => {
                const out = unavailable.has(l.id);
                const full = lineName(l);
                return (
                  <li key={l.id} className={`ad-line${out ? " ad-line--out" : ""}`}>
                    <span className="ad-line__name">
                      {l.name_ar}
                      <span className="ad-line__meta">
                        {out ? "نفدت الكمية، احذفه من السلة" : lineMeta(l)}
                      </span>
                    </span>
                    <span className="ad-stepper">
                      <button
                        type="button"
                        aria-label={`زيادة ${full}`}
                        onClick={() => changeQty(l, l.qty + 1)}
                        disabled={out || l.qty >= 20}
                      >
                        +
                      </button>
                      <span aria-label={`الكمية ${l.qty}`}>{l.qty}</span>
                      <button
                        type="button"
                        aria-label={l.qty === 1 ? `احذف ${full}` : `إنقاص ${full}`}
                        onClick={() => changeQty(l, out ? 0 : l.qty - 1)}
                      >
                        −
                      </button>
                    </span>
                    <span className="ad-line__price">{formatPrice(l.price_ils * l.qty)}</span>
                  </li>
                );
              })}
            </ul>

            <div className="ad-total">
              <span>المجموع</span>
              <span className="ad-price">{formatPrice(total)}</span>
            </div>

            <div className="ad-field">
              <label htmlFor={ids.name}>الاسم</label>
              <input
                ref={nameRef}
                id={ids.name}
                name="name"
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
                  اكتب اسمك ليصل الطلب باسمك
                </span>
              )}
            </div>
            <div className="ad-field">
              <label htmlFor={ids.area}>المنطقة (اختياري)</label>
              <input
                id={ids.area}
                name="area"
                autoComplete="address-level2"
                maxLength={80}
                placeholder="مثلاً: رفيديا"
                value={area}
                onChange={(e) => setArea(e.target.value)}
              />
            </div>
            <div className="ad-field">
              <label htmlFor={ids.phone}>رقم الجوال</label>
              <PhoneField
                id={ids.phone}
                required
                defaultPhone={prefill?.phone}
                onChange={(v) => {
                  setPhone(v);
                  if (phoneError) setPhoneError(false);
                }}
                invalid={phoneError}
                describedBy={phoneError ? ids.phoneErr : undefined}
              />
              {phoneError && (
                <span className="ad-field__error" id={ids.phoneErr}>
                  {PHONE_MESSAGES[phoneProblem(phone.value) ?? "number"]}
                </span>
              )}
            </div>

            {phase.kind === "error" && (
              <p className="ad-sheet__error" role="alert">
                {phase.message}
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

            <button className="ad-btn ad-btn--whatsapp ad-btn--block" type="submit" disabled={sending || stillBlocked}>
              <WhatsAppIcon />
              {sending ? "جارٍ تجهيز الطلب…" : "أرسل الطلب على واتساب"}
            </button>
            <p className="ad-sheet__note">سيُفتح واتساب برسالة جاهزة، والدفع عند الاستلام.</p>
          </form>
        )}
      </section>
    </dialog>
  );
}
