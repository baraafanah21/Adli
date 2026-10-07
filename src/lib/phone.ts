/*
  Mobile numbers (E3.1). In Palestine one number can be on WhatsApp under +970 or +972 only, so the person chooses
  the prefix beside the field (PhoneField) and types the local number; nothing is ever guessed from the first digits.
  Saved form, everywhere: +9705XXXXXXXX or +9725XXXXXXXX. private.normalize_mobile() in the database has the last word
  and accepts that full form only.
*/

export type Prefix = "970" | "972";
export const PREFIXES: Prefix[] = ["970", "972"];
export const DEFAULT_PREFIX: Prefix = "970";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Arabic-Indic digits → 0-9; spaces, dashes, dots, brackets and direction marks removed. */
const clean = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).replace(/[\s().\-‎‏]/g, "");

/**
 * What was typed or pasted into the local field. The prefix is taken from it only when it starts explicitly with
 * +970, +972, 00970 or 00972; anything else (970…, 972…, 05…, 5…) leaves the chosen prefix alone (prefix: null).
 */
export function splitPasted(value: string): { prefix: Prefix | null; local: string } {
  const v = clean(value);
  const m = /^(?:\+|00)(970|972)(.*)$/.exec(v);
  return m ? { prefix: m[1] as Prefix, local: m[2] } : { prefix: null, local: v };
}

/** The local part → 9 digits starting with 5 (one leading 0 dropped), or null. */
export function localMobile(local: string): string | null {
  const v = clean(local).replace(/^0/, "");
  return /^5\d{8}$/.test(v) ? v : null;
}

/** Prefix + local part → +9705XXXXXXXX, or null when the local part isn't a mobile. */
export function fullMobile(prefix: Prefix, local: string): string | null {
  const l = localMobile(local);
  return l ? `+${prefix}${l}` : null;
}

/** A saved number's prefix and local part, to fill the field again (null for anything not in full form). */
export function parseMobile(phone: string | null | undefined): { prefix: Prefix; local: string } | null {
  const m = /^\+(970|972)(5\d{8})$/.exec(clean(phone ?? ""));
  return m ? { prefix: m[1] as Prefix, local: m[2] } : null;
}

/** Server-side check of a submitted number: the full form only, same rule as private.normalize_mobile(). */
export function normalizeMobile(phone: string): string | null {
  const p = parseMobile(phone);
  return p ? `+${p.prefix}${p.local}` : null;
}

/**
 * A saved phone → the digits wa.me wants, used as is: +970… / +972… without the "+". Anything else has no reliable
 * WhatsApp number, so no link (the number is still shown as text).
 */
export function whatsappDigits(phone: string | null): string | null {
  const p = parseMobile(phone);
  return p ? `${p.prefix}${p.local}` : null;
}
