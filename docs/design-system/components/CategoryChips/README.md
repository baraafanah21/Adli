# CategoryChips

Toggle chips that filter the product shelf by category, with a count of products in each.

- Markup: `.ad-chips[role=group]` of `button.ad-chip[aria-pressed]`, each with an optional `.ad-chip__count`.
- The consumer provides the categories from Supabase `categories` (sorted by `sort`) and the active slug.
- Exactly one chip is pressed. Changing it filters the shelf; it does not reload the page. Reflect it in the URL (`?c=perfumes`).
- Pressed state is a `brass` fill with `on-brass` text; resting chips are outlined in `line-strong`.
- Chips are at least 44px tall (touch target), above the preview's 40px.
- Changing a chip filters the HTML shelf and updates `?c=` with `history.replaceState` (no reload, no new server fetch). An unknown slug falls back to «الكل». An empty category says «لا توجد منتجات في هذه الفئة حالياً.» with a ghost «الكل» button.
