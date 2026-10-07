/**
 * A customer's phone as typed in the order sheet → the international digits wa.me wants, or null.
 * "+…" and "00…" are already international. A local 10-digit mobile starting 059 / 056 (Jawwal, Ooredoo) is
 * Palestinian (970); any other 05… is Israeli (972). Anything else can't be dialled reliably, so no link.
 */
export function whatsappDigits(phone: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 ? digits : null;
  if (digits.startsWith("00")) return digits.length >= 10 ? digits.slice(2) : null;
  if (/^(970|972)5\d{8}$/.test(digits)) return digits;
  if (/^05\d{8}$/.test(digits)) return (/^05[69]/.test(digits) ? "970" : "972") + digits.slice(1);
  return null;
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * Booking phones are mobiles only. Same rule as private.normalize_mobile() in the database, which has the last word:
 * 05x local, +970 / +972 or 00970 / 00972 (a 0 after the country code is dropped); spaces, dashes, dots and brackets
 * are ignored, Arabic-Indic digits accepted. Returns +9705XXXXXXXX / +9725XXXXXXXX, or null.
 */
export function normalizeMobile(phone: string): string | null {
  const v = phone
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[\s().\-\u200E\u200F]/g, "");
  if (/^05\d{8}$/.test(v)) return (/^05[69]/.test(v) ? "+970" : "+972") + v.slice(1);
  const m = /^(?:\+|00)?(970|972)0?(5\d{8})$/.exec(v);
  return m ? `+${m[1]}${m[2]}` : null;
}
