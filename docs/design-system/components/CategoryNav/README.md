# CategoryNav

How visitors reach the categories from every page. Two forms of the same list, never both on screen:

- **Desktop (≥ 720px), `CategoryNav`:** a «الفئات» text button in the header (`aria-expanded`, chevron turns 180°) opens a panel under it: a 5-column grid of the categories, each a tile with its icon in `brass` above the name. Panel on `surface`, `line` border, `radius-md`, `shadow-panel`.
- **Phones (< 720px), `CategoryStrip`:** a row under the header (`line` border on top) of pill links, each with an 18px icon and the name; it scrolls sideways inside itself, never the page. The current category is filled `brass` with `on-brass` text and scrolls into view.
- Links go to `/c/<slug>`. The current one has `aria-current="page"` (an inset `brass` ring in the panel, the `brass` fill in the strip).
- Data: active `categories` in `sort` order with `slug`, `name_ar`, `icon`. The icon is a name from the fixed set in `src/components/icons.tsx` (`CategoryIcon`; the same list is the `categories.icon` check constraint). An unknown icon falls back to the bottle.
- Keyboard (panel): ArrowDown on the button opens it and focuses the first tile. Arrow keys move between tiles (RTL: ArrowLeft is next, ArrowUp/Down move a row), Home/End jump to the ends. Esc closes and returns focus to the button. It also closes on an outside click, when focus leaves it, and after a navigation.
- Touch targets: button and strip links 44px tall; panel tiles 96px.
- Both forms are `<nav aria-label="الفئات">`; the hidden one is `display: none`, so screen readers meet only one.
