"use client";

import { useState } from "react";
import { DEFAULT_PREFIX, PREFIXES, fullMobile, localMobile, parseMobile, splitPasted, type Prefix } from "@/lib/phone";
import styles from "./PhoneField.module.css";

export type PhoneValue = {
  /** What to send: "+9705XXXXXXXX" when valid, "" when empty, otherwise the raw attempt (the server refuses it). */
  value: string;
  valid: boolean;
  empty: boolean;
};

type Props = {
  /** The input's id: the caller's <label htmlFor> points here. */
  id: string;
  /** Set for a plain <form>: the full number is submitted under this name. */
  name?: string;
  /** A saved number (+970… / +972…) fills both parts; its prefix is the person's last choice. */
  defaultPhone?: string | null;
  /**
   * Remember the prefix on this device under this key (the admin's walk-in form); else +970 when nothing is saved.
   * Only for a field that mounts in the browser (the walk-in sheet opens on a tap), since it reads localStorage
   * on the first render.
   */
  rememberKey?: string;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange?: (v: PhoneValue) => void;
};

function valueOf(prefix: Prefix, local: string): PhoneValue {
  const empty = local.trim() === "";
  const full = fullMobile(prefix, local);
  return { value: empty ? "" : (full ?? `+${prefix}${local.replace(/\s/g, "")}`), valid: full !== null, empty };
}

function rememberedPrefix(key: string | undefined): Prefix | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(key);
    return stored === "970" || stored === "972" ? stored : null;
  } catch {
    return null;
  }
}

/** The value a saved number gives before anyone types (for a caller that keeps its own copy). */
export const initialPhoneValue = (phone: string | null | undefined): PhoneValue => {
  const p = parseMobile(phone);
  return p ? valueOf(p.prefix, p.local) : { value: "", valid: false, empty: true };
};

/**
 * A mobile number: the prefix (+970 / +972) chosen beside the field, the local number typed in it (9 digits starting
 * with 5; a leading 0, spaces and Arabic digits are fine). Pasting a full number that starts with +970, +972, 00970
 * or 00972 sets the prefix from it; nothing else ever changes the prefix, and nothing is guessed from the digits.
 */
export function PhoneField({ id, name, defaultPhone, rememberKey, required, invalid, describedBy, onChange }: Props) {
  const saved = parseMobile(defaultPhone);
  const [prefix, setPrefix] = useState<Prefix>(() => saved?.prefix ?? rememberedPrefix(rememberKey) ?? DEFAULT_PREFIX);
  const [local, setLocal] = useState(saved?.local ?? (defaultPhone ?? ""));

  function update(nextPrefix: Prefix, nextLocal: string) {
    setPrefix(nextPrefix);
    setLocal(nextLocal);
    if (rememberKey) {
      try {
        localStorage.setItem(rememberKey, nextPrefix);
      } catch {}
    }
    onChange?.(valueOf(nextPrefix, nextLocal));
  }

  const current = valueOf(prefix, local);
  return (
    <div className={styles.row} dir="ltr">
      <select
        className={styles.prefix}
        aria-label="مقدمة الرقم"
        value={prefix}
        onChange={(e) => update(e.target.value as Prefix, local)}
      >
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
        placeholder="599 123 456"
        value={local}
        onChange={(e) => {
          const pasted = splitPasted(e.target.value);
          if (pasted.prefix) update(pasted.prefix, pasted.local);
          else update(prefix, e.target.value);
        }}
        onBlur={() => {
          // Tidy a valid number to its 9 digits (drops the 0, spaces, Arabic digits).
          const l = localMobile(local);
          if (l && l !== local) update(prefix, l);
        }}
        required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      {name && <input type="hidden" name={name} value={current.value} />}
    </div>
  );
}
