// Admin-only icons (the image editor, the gallery), in the same Phosphor "light" style as src/components/icons.tsx
// (1.5 stroke, currentColor). Kept here, not in icons.tsx, so they never reach a public page's bundle (icons.tsx is
// shared with the shop).
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

/** «المعرض»: photos and videos. */
export function GalleryIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="m3.5 16 5-5 4 4 2.5-2.5 5.5 5.5" />
      <circle cx="15.5" cy="9" r="1.5" />
    </svg>
  );
}

/** A grip to drag an item into place. */
export function GripIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth={2.5} />
    </svg>
  );
}

/** A video item (its poster is shown, this marks it). */
export function PlayIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" />
    </svg>
  );
}
