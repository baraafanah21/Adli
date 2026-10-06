// Line icons in the Phosphor "light" style (1.5 stroke, currentColor). Inline to avoid a dependency.
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

/** The perfume bottle from the logo: oval stopper, collar, square body with inner frame and dip tube. */
export function BottleIcon({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <ellipse cx="12" cy="3.6" rx="2.6" ry="1.8" />
      <path d="M10.6 5.4v2.2h2.8V5.4" />
      <rect x="5.5" y="7.6" width="13" height="14" rx="1" />
      <rect x="7.6" y="9.7" width="8.8" height="9.8" rx="0.4" strokeWidth="1" />
      <path d="M12 7.6v9.4" strokeWidth="1" />
    </svg>
  );
}

export function MoonIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M20.4 14.2A8.5 8.5 0 0 1 9.8 3.6a8.5 8.5 0 1 0 10.6 10.6Z" />
    </svg>
  );
}

export function SunIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </svg>
  );
}

/** Points back. In RTL "back" is to the right. */
export function ArrowBackIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  );
}
