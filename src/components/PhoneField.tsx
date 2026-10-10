"use client";

import { useState } from "react";
import { PHONE_EXAMPLE, PREFIXES, fullMobile, localMobile, parseMobile, splitPasted, type Prefix } from "@/lib/phone";
import styles from "./PhoneField.module.css";

export type PhoneValue = {
  /**
   * What to send: "+9705XXXXXXXX" when valid, "" when empty, otherwise the raw attempt (the server refuses it): the
   * bare local number when no prefix is chosen, so phoneProblem() can say which part is missing.
   */
  value: string;
  valid: boolean;
  empty: boolean;
};

type Props = {
  /** The input's id: the caller's <label htmlFor> points here. */
  id: string;
  /** Set for a plain <form>: the full number is submitted under this name. */
  name?: string;
  /** A saved number (+970… / +972…) fills both parts: the person's own number and prefix. */
  defaultPhone?: string | null;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange?: (v: PhoneValue) => void;
};

/** No prefix chosen yet. */
type Choice = Prefix | "";

const clean = (s: string) => s.replace(/\s/g, "");

function valueOf(prefix: Choice, local: string): PhoneValue {
  const empty = local.trim() === "";
  const full = prefix ? fullMobile(prefix, local) : null;
  return { value: empty ? "" : (full ?? (prefix ? `+${prefix}${clean(local)}` : clean(local))), valid: full !== null, empty };
}

/** The value a saved number gives before anyone types (for a caller that keeps its own copy). */
export const initialPhoneValue = (phone: string | null | undefined): PhoneValue => {
  const p = parseMobile(phone);
  return p ? valueOf(p.prefix, p.local) : { value: "", valid: false, empty: true };
};

/**
 * A mobile number: the prefix (+970 / +972) chosen beside the field, the local number typed in it (05… / 5…; spaces
 * and Arabic digits are fine). Both start empty and the prefix has no default: the same 05… number can be on WhatsApp
 * under either, so only the person knows. Typing or pasting a full number that starts with +970, +972, 00970 or 00972
 * sets the prefix from it; nothing else ever changes the prefix, and nothing is guessed from the digits.
 */
export function PhoneField({ id, name, defaultPhone, required, invalid, describedBy, onChange }: Props) {
  const saved = parseMobile(defaultPhone);
  const [prefix, setPrefix] = useState<Choice>(saved?.prefix ?? "");
  const [local, setLocal] = useState(saved?.local ? `0${saved.local}` : (defaultPhone ?? ""));

  function update(nextPrefix: Choice, nextLocal: string) {
    setPrefix(nextPrefix);
    setLocal(nextLocal);
    onChange?.(valueOf(nextPrefix, nextLocal));
  }

  const current = valueOf(prefix, local);
  // The prefix is marked only when it is what's missing (a full local number and no prefix).
  const prefixMissing = invalid && !prefix && localMobile(local) !== null;
  return (
    <div className={styles.row} dir="ltr">
      <select
        className={styles.prefix}
        aria-label="مقدمة الرقم"
        value={prefix}
        onChange={(e) => update(e.target.value as Choice, local)}
        required={required}
        aria-invalid={prefixMissing || undefined}
        aria-describedby={describedBy}
        data-empty={prefix === "" || undefined}
      >
        <option value="" disabled>
          المقدمة
        </option>
        {PREFIXES.map((p) => (
          <option key={p} value={p}>
            +{p}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        maxLength={20}
        placeholder={PHONE_EXAMPLE}
        value={local}
        onChange={(e) => {
          const pasted = splitPasted(e.target.value);
          if (pasted.prefix) update(pasted.prefix, pasted.local);
          else update(prefix, e.target.value);
        }}
        onBlur={() => {
          // Tidy a valid number to 05XXXXXXXX (drops spaces, Arabic digits; adds the 0 when typed without it).
          const l = localMobile(local);
          if (l && `0${l}` !== local) update(prefix, `0${l}`);
        }}
        required={required}
        aria-invalid={(invalid && !prefixMissing) || undefined}
        aria-describedby={describedBy}
      />
      {name && <input type="hidden" name={name} value={current.value} />}
    </div>
  );
}
