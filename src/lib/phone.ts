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
