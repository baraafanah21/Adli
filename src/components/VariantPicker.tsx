"use client";

import type { CSSProperties } from "react";
import type { ProductOption, Variant } from "@/lib/catalog";

type Props = {
  options: ProductOption[];
  variants: Variant[];
  selected: Variant;
  onSelect: (variant: Variant) => void;
};

const has = (v: Variant, valueId: string | undefined) => !!valueId && v.option_value_ids.includes(valueId);

/** Value chosen for each option in a variant. */
function valuesOf(options: ProductOption[], v: Variant) {
  return new Map(options.map((o) => [o.id, o.values.find((x) => has(v, x.id))?.id]));
}

/**
 * Picks the variant for a click on `valueId`: the exact combination if it is in stock, otherwise the in-stock
 * variant with that value that keeps most of the other choices.
 */
export function resolveVariant(options: ProductOption[], variants: Variant[], current: Variant, optionId: string, valueId: string) {
  const want = valuesOf(options, current);
  want.set(optionId, valueId);
  const exact = variants.find((v) => options.every((o) => has(v, want.get(o.id))));
  if (exact && exact.stock_state !== "out") return exact;
  const score = (v: Variant) => options.filter((o) => has(v, want.get(o.id))).length;
  const inStock = variants.filter((v) => has(v, valueId) && v.stock_state !== "out").sort((a, b) => score(b) - score(a));
  return inStock[0] ?? exact ?? variants.find((v) => has(v, valueId)) ?? current;
}

/**
 * One fieldset per option. Sizes are chips (ad-chip), colours a swatch with the colour's name beside it.
 * Native radios: arrow keys move within an option, and an unavailable value is a disabled radio (struck through).
 * A value is unavailable when no in-stock variant has it together with the other current choices.
 */
export function VariantPicker({ options, variants, selected, onSelect }: Props) {
  const current = valuesOf(options, selected);

  return (
    <div className="ad-picker">
      {options.map((o) => {
        // Values no active variant uses are not shown at all.
        const values = o.values.filter((x) => variants.some((v) => has(v, x.id)));
        const chosen = values.find((x) => x.id === current.get(o.id));
        return (
          <fieldset key={o.id} className="ad-picker__option">
            <legend className="ad-picker__legend">
              {o.name_ar}
              {chosen && <span className="ad-picker__chosen">: {chosen.label_ar}</span>}
            </legend>
            <div className="ad-picker__values">
              {values.map((x) => {
                const available = variants.some(
                  (v) =>
                    v.stock_state !== "out" &&
                    has(v, x.id) &&
                    options.every((other) => other.id === o.id || has(v, current.get(other.id))),
                );
                const checked = x.id === current.get(o.id);
                const color = o.kind === "color" && x.hex;
                return (
                  <label
                    key={x.id}
                    className={[color ? "ad-swatch" : "ad-chip", !available && "is-out"].filter(Boolean).join(" ")}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      name={`option-${o.id}`}
                      value={x.id}
                      checked={checked}
                      disabled={!available && !checked}
                      onChange={() => onSelect(resolveVariant(options, variants, selected, o.id, x.id))}
                    />
                    {color && <span className="ad-swatch__dot" style={{ "--swatch": x.hex } as CSSProperties} aria-hidden="true" />}
                    <span className="ad-picker__label">{x.label_ar}</span>
                    {!available && <span className="sr-only">، نفدت الكمية</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
