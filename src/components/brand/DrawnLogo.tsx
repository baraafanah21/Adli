import type { CSSProperties } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { getLogoPaths } from "@/lib/brand-paths";

type Props = { label: string; className?: string };

/**
 * The full logo drawing itself, then filling, in CSS from the first frame (no JS): the hero's mark. The paths are the
 * file's own (public/brand/adli-logo-mono.svg, read on the server by lib/brand-paths.ts), in `currentColor`, so
 * nothing is redrawn: the end state is the logo exactly. Each path is drawn by a stroke (pathLength 1), then filled,
 * and the stroke fades (components.css, .ad-drawn). With reduced motion it is simply there. Only the hero draws
 * (above the fold, so in CSS: it can't wait for the motion layer); the footer's logo is the still BrandMark. Size it
 * with CSS (width; the height follows the viewBox).
 */
export async function DrawnLogo({ label, className }: Props) {
  const mark = await getLogoPaths();
  if (!mark) return <BrandMark kind="logo" tone="mono" width={200} label={label} className={className} />;
  return (
    <svg
      viewBox={mark.viewBox}
      width={mark.width}
      height={mark.height}
      role="img"
      aria-label={label}
      className={["ad-drawn", className].filter(Boolean).join(" ")}
    >
      {mark.paths.map((d, i) => (
        <path key={i} d={d} pathLength={1} fillRule="evenodd" style={{ "--i": i } as CSSProperties} />
      ))}
    </svg>
  );
}
