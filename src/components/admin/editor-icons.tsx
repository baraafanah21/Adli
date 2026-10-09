// The image editor's icons, in the same Phosphor "light" style as src/components/icons.tsx (1.5 stroke, currentColor).
// Kept here, not in icons.tsx, so they never reach a public page's bundle (icons.tsx is shared with the shop).
type IconProps = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
});

/** Turn a quarter clockwise. Not mirrored in RTL: rotation has no reading direction. */
export function RotateRightIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M20 8.5A8.5 8.5 0 1 0 20.5 13" />
      <path d="M20.5 3.5v5h-5" />
    </svg>
  );
}

/** Turn a quarter counter-clockwise. */
export function RotateLeftIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 8.5A8.5 8.5 0 1 1 3.5 13" />
      <path d="M3.5 3.5v5h5" />
    </svg>
  );
}

/** Back to how it was («إرجاع»). */
export function ResetIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7" />
      <path d="M4 4v4.7h4.7" />
    </svg>
  );
}
