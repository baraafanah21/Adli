"use client";

export type ChipCategory = { slug: string; name_ar: string; count: number };

type Props = {
  categories: ChipCategory[];
  total: number;
  /** null means «الكل». */
  active: string | null;
  onChange: (slug: string | null) => void;
};

/** Toggle chips that filter the shelf (one row that scrolls on phones). Exactly one is pressed; the parent keeps it in ?c=slug. */
export function CategoryChips({ categories, total, active, onChange }: Props) {
  return (
    <div className="ad-chips ad-chips--scroll" role="group" aria-label="الفئات">
      <button className="ad-chip" type="button" aria-pressed={active === null} onClick={() => onChange(null)}>
        الكل<span className="ad-chip__count">{total}</span>
      </button>
      {categories.map((c) => (
        <button
          key={c.slug}
          className="ad-chip"
          type="button"
          aria-pressed={active === c.slug}
          onClick={() => onChange(c.slug)}
        >
          {c.name_ar}
          {c.count > 0 ? (
            <span className="ad-chip__count">{c.count}</span>
          ) : (
            <span className="ad-chip__count">قريباً</span>
          )}
        </button>
      ))}
    </div>
  );
}
