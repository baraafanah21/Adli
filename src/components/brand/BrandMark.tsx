import Image from "next/image";

/**
 * The Adli logo, from the traced files in public/brand/ (see its README) and nothing else: never redrawn.
 * - tone "color": the file itself (forest, with the seal's cream interior). Use the seal this way on any ground.
 * - tone "mono": the -mono file as a CSS mask over `currentColor`, so it takes the text colour of its parent
 *   (cream on the forest footer, --ink on the auth card). The wordmark and the full logo are forest-only, so on a
 *   dark ground they must be mono.
 * Size is fixed from the file's viewBox (no layout shift). README minimums: seal 24px, full logo 120px wide.
 * Without `label` the mark is decorative (aria-hidden).
 */
const FILES = {
  seal: { w: 1157, h: 1156 },
  wordmark: { w: 766, h: 270 },
  logo: { w: 1165, h: 1469 },
  bottle: { w: 155, h: 270 },
} as const;

export type BrandMarkKind = keyof typeof FILES;

type Props = {
  kind: BrandMarkKind;
  tone?: "color" | "mono";
  /** One of the two; the other follows the file's ratio. */
  width?: number;
  height?: number;
  label?: string;
  className?: string;
};

export function BrandMark({ kind, tone = "color", width, height, label, className }: Props) {
  const f = FILES[kind];
  const w = width ?? Math.round(((height ?? 32) * f.w) / f.h);
  const h = height ?? Math.round((w * f.h) / f.w);

  if (tone === "color" && kind !== "bottle") {
    return (
      <Image
        src={`/brand/adli-${kind}.svg`}
        alt={label ?? ""}
        width={w}
        height={h}
        unoptimized
        className={["ad-mark", className].filter(Boolean).join(" ")}
        aria-hidden={label ? undefined : true}
      />
    );
  }

  // The mask file per kind is in components.css (.ad-mark--seal …).
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={["ad-mark", "ad-mark--mono", `ad-mark--${kind}`, className].filter(Boolean).join(" ")}
      style={{ width: w, height: h }}
    />
  );
}
