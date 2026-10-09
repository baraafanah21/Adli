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

// The logo's own bottle (the cart) is public/brand/adli-bottle-icon-mono.svg through BrandMark, never redrawn here.

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

export function SearchIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  );
}

export function UserIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
    </svg>
  );
}

/** The official WhatsApp glyph (from the design-system Button preview). Only on the send-order button. */
export function WhatsAppIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"
      />
    </svg>
  );
}

/* ---------- Admin navigation ---------- */

export function HomeIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function ReceiptIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

export function BoxIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </svg>
  );
}

export function GridIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
    </svg>
  );
}

export function UsersIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c1-3.2 3.4-5 6.5-5s5.5 1.8 6.5 5M16 5.2a3.5 3.5 0 0 1 0 6.6M18 15.4c1.6.7 2.8 2.3 3.5 4.6" />
    </svg>
  );
}

export function MoreIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="5.5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18.5" cy="12" r="1.2" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function CalendarIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="M8 13h2M14 13h2M8 16.5h2" strokeWidth="1.2" />
    </svg>
  );
}

export function ScissorsIcon({ size = 22 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="6" cy="6.5" r="2.5" />
      <circle cx="6" cy="17.5" r="2.5" />
      <path d="M8.2 7.8 20 17M8.2 16.2 20 7" />
    </svg>
  );
}

/*
  Category icons. The names are the fixed set allowed by the categories.icon check constraint
  (supabase/migrations/20261006000700_categories_ten.sql); add a drawing here before allowing a new name there.
*/
const CATEGORY_PATHS = {
  perfume: (
    <>
      <path d="M10 3h4v3h-4z" />
      <rect x="6" y="6" width="12" height="15" rx="2" />
      <path d="M9 11h6" strokeWidth="1" />
    </>
  ),
  shaver: (
    <>
      <rect x="8" y="9" width="8" height="12" rx="3" />
      <path d="M7 3h10v3a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3z" />
      <path d="M9 5h6M12 13v3" strokeWidth="1" />
    </>
  ),
  cap: (
    <>
      <path d="M4 15a8 8 0 0 1 16 0z" />
      <path d="M20 15c1.2 0 2 .6 2 1.4 0 .6-.6 1.1-1.6 1.1H11" />
      <path d="M12 7V5.5" />
    </>
  ),
  watch: (
    <>
      <circle cx="12" cy="12" r="5.5" />
      <path d="M9 7l.7-4h4.6L15 7M9 17l.7 4h4.6L15 17M12 9.5V12l1.6 1.2" />
    </>
  ),
  underwear: (
    <>
      <path d="M3.5 6h17v3.5c-3 0-5.6 2.4-6.4 7.5H9.9C9.1 11.9 6.5 9.5 3.5 9.5z" />
      <path d="M3.5 8h17" strokeWidth="1" />
    </>
  ),
  sports: (
    <>
      <path d="M3 12h2M19 12h2M5 8.5v7M19 8.5v7M7.5 7v10M16.5 7v10M7.5 12h9" />
    </>
  ),
  sunglasses: (
    <>
      <path d="M2.5 9h19" />
      <path d="M3.5 9l.6 4.2a2.5 2.5 0 0 0 2.5 2.1h1.6a2.5 2.5 0 0 0 2.4-1.9L11 9M13 9l.4 4.4a2.5 2.5 0 0 0 2.4 1.9h1.6a2.5 2.5 0 0 0 2.5-2.1L20.5 9" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="9" width="16" height="12" rx="1" />
      <path d="M3 9h18M12 9v12M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9c2 0 5.5 0 5.5-1.5S13.5 5.5 12 9" />
    </>
  ),
  beard: (
    <>
      <path d="M5 5v5a7 7 0 0 0 14 0V5" />
      <path d="M9 12.5c1.8-1 4.2-1 6 0M10 16.5h4" />
    </>
  ),
  body: (
    <>
      <path d="M9 3h6v3.5H9z" />
      <path d="M8 6.5h8l1 3.5v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V10z" />
      <path d="M10 14h4" strokeWidth="1" />
    </>
  ),
} as const;

export type CategoryIconName = keyof typeof CATEGORY_PATHS;

/** The allowed names, in the order the admin's icon picker shows them. */
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_PATHS) as CategoryIconName[];

/** A category's icon by name; an unknown or missing name falls back to the perfume icon. */
export function CategoryIcon({ name, size = 24 }: IconProps & { name: string | null }) {
  const paths = name && name in CATEGORY_PATHS ? CATEGORY_PATHS[name as CategoryIconName] : CATEGORY_PATHS.perfume;
  return <svg {...base(size)}>{paths}</svg>;
}

/** Products (the admin menu): the generic perfume icon, not the logo's bottle. */
export function PerfumeIcon({ size = 24 }: IconProps) {
  return <svg {...base(size)}>{CATEGORY_PATHS.perfume}</svg>;
}

/** Points back. In RTL "back" is to the right. */
export function ArrowBackIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  );
}
