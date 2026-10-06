@AGENTS.md

# Adli Salon (عدلي)

Showcase site for a men's barbershop that also sells perfumes and creams. Products are shown with their real transparent photos; the one 3D element is the Adli bottle in the hero, a live three.js scene (`src/components/HeroBottle.tsx`, reference `docs/prototypes/hero-bottle-prototype.html`). Buying means sending a pre-filled WhatsApp message. No online payment. Accounts are optional (guests can always order); signed-in customers see their orders and review products they received. Roles: owner and staff, see `docs/design-system/accounts-and-roles.md`.

Stack: Next.js (App Router, TypeScript) on Vercel · Supabase (Postgres, Storage, Auth) · three (pinned, hero bottle only; no R3F/drei) · gsap + lenis.

## Work in order

Follow `docs/ROADMAP.md` phase by phase. Finish and verify one phase (build passes, page checked on a phone width) before starting the next. Tick the boxes in the roadmap as you go. Don't start a later phase's work early.

## Design system (read before any UI work)

- Brand book: `docs/design-system/brand-book.md` (Arabic). 3D + motion rules: `docs/design-system/3d-and-motion.md`. Data + WhatsApp + env: `docs/design-system/build-stack.md`. Components: `docs/design-system/components/<Name>/README.md` with a reference `preview.html`.
- Tokens live in `src/styles/tokens.css` (mirrors `docs/design-system/tokens.json`). Component classes (`ad-btn`, `ad-card`, `ad-seal`, `ad-chip`, `ad-sheet`, `ad-pole`…) in `src/styles/components.css`.
- Never hard-code a color, radius or spacing value in components: use `var(--token)`. Only the hero canvas may read token hex values, via a single `src/lib/brand.ts` constants file.
- Logo colors are fixed: `--forest` #0B300F and `--cream` #F5F5DB. Seal: `public/brand/adli-seal.svg`; full logo: `public/brand/logo.jpg`.
- The signature shape is the seal: a circle with two rings, from the logo. Every product stands on a seal turntable (`SealStage`). Don't invent other signature shapes.
- Fonts: Amiri (display, `latin-mark`) and Readex Pro (everything else), loaded with next/font in `src/app/layout.tsx`.

## Rules

- The site is Arabic and RTL (`<html lang="ar" dir="rtl">`). Use logical CSS properties (`margin-inline-start`, `inset-inline-end`), never left/right, except inside the hero canvas.
- Copy: plain Arabic, singular polite "you". Action names stay identical through the flow: «أضف للطلب» → «أُضيف للطلب» → «أرسل الطلب على واتساب». Prices `₪ 180`, western digits.
- Only the order button uses `--whatsapp`, with `--on-whatsapp` (dark) text, never white.
- Exactly one WebGL canvas on the site: the hero bottle. Products are transparent photos only; no 3D product models.
- The hero shows `public/hero/v1/f000.webp` as a priority `<img>` poster; three.js loads after first paint (`requestIdleCallback`, dynamic import, `ssr: false`) and fades in on its first frame. `prefers-reduced-motion` or no WebGL2: poster only, three never loads.
- Canvas: `dpr` ≤ 1.75, paused off-screen and in hidden tabs, full dispose on unmount, horizontal drag only (`touch-action: pan-y`), no zoom.
- Performance: three is never in the first-load bundle. LCP is the hero title or the poster, never the canvas. Mobile Lighthouse: LCP < 2.5s, CLS < 0.1.

## Supabase

- Project ref `hdkmrozwihaoqiqjlzld` (eu-central-1). Migrations in `supabase/migrations/`, applied in order. Add new migrations as new files; never edit an applied one.
- Tables: `categories` (`is_active`, `icon` from the fixed set in `CategoryIcon`, `description_ar`), `products` (`kind` simple / bundle), `product_options`, `product_option_values` (colour values carry `hex`), `product_variants` (every product has ≥ 1; a simple product has one default variant with no option values, hidden in the UI), `bundle_items`, `orders` (optional `user_id`), `order_items` (`variant_id` + `variant_name_ar` snapshot), `profiles` (one per auth user, created by the `on_auth_user_created` trigger; users update only `full_name`, `area`, `phone`), `user_roles` (`owner` / `staff` + `is_barber`; written from the SQL Editor until the Phase F staff screen). RLS is on for all. The public reads active categories, active products, and active variants of active products only. `product_variants.stock_quantity` is not granted to anon / authenticated (column grants): the site reads `stock_state` or the `variant_availability` view (state + variant label), so name every column, never `select('*')`. Embeds between products and variants need FK hints (`product_variants!product_variants_product_id_fkey`) because `bundle_items` / `order_items` also link them; customers read their own profile and orders, staff read all. `private.*` holds server-only state (`app_secrets`, `order_rate_hits`) and is never exposed.
- Orders are created ONLY through `POST /api/orders` (`src/app/api/orders/route.ts`), which calls `place_order(p_idempotency_key, p_customer_name, p_area, p_phone, p_items, p_client_ip, p_gateway_secret)` with `p_items = [{variant_id, qty}]` with the server-only `ORDER_GATEWAY_SECRET` (its SHA-256 is in `private.app_secrets`; a direct browser RPC call is refused). It recomputes prices, rate-limits 5 orders/minute per IP, stores `auth.uid()` as `orders.user_id` when the caller is signed in (guests stay null), and returns `{code, total_ils, items}`. It checks `stock_quantity` against the whole order (bundle pieces included); stock is decremented in Phase F. Error codes: `P0001` unavailable (DETAIL = `[{id: variant_id, name_ar: product + variant}]`), `P0002` rate limited, `22023` invalid, `42501` bad secret.
- The cart is `src/lib/cart-store.ts` (localStorage, `v: 2`, one line per variant) with `useCart()` / `useCartUI()` from `src/components/cart/CartContext.tsx`. The order sheet generates one idempotency key per checkout attempt (sessionStorage, rotated when the cart changes), then builds the message with `buildOrderMessage()` and opens `whatsappUrl()` from `src/lib/whatsapp.ts` in the same tab.
- Staff = any row in `public.user_roles`. `private.is_admin()` (any role) backs the staff policies; `private.has_role(app_role[])` checks a specific role. A trigger keeps at least one owner (`P0003 last_owner`).
- `/admin` and `/account` are guarded in three layers: `src/proxy.ts` (signed in), `requireUser()` / `requireRole()` in `src/lib/auth/guards.ts` (roles read fresh from `user_roles`; wrong role = 404), then RLS.
- Auth email templates (Arabic) live in `supabase/templates/`; they're pasted into the dashboard by hand (see its README).
- Admin writes go only through `admin_*` RPC functions (security definer, `execute` for `authenticated` only, `private.has_role()` in their first line); no role has direct write grants on `orders`, `order_items` or any catalog table (`categories`, `products`, `product_options`, `product_option_values`, `product_variants`, `bundle_items`); staff still read the whole catalog through RLS. Product photos are uploaded from the browser to the `products` bucket (`<product id>/<uuid>.webp|jpg|png`, resized to 1600px; WebP where the browser can encode it, else JPEG for opaque photos and PNG for transparent ones, as on iPhone; staff-only storage policy, 5 MB) and recorded with `admin_set_product_image()`. `/admin` pages and Server Actions call `requireRole()` themselves, not just the layout. The advisor warning `authenticated_security_definer_function_executable` on `admin_*` is expected (list in `docs/design-system/accounts-and-roles.md`).
- Order status only through `admin_set_order_status()`: `new → confirmed | cancelled`, `confirmed → done | cancelled`; the same status again is a no-op. Confirming takes stock (bundles split into pieces), cancelling a confirmed order gives back exactly what it took. Every change is in `order_events`.
- **Stock only moves through `private.apply_stock_movement(variant_id, delta, reason, note, order_id)`**: it writes a `stock_movements` row (reason `receive` / `sale` / `cancel` / `adjust` / `damage`) and the new `stock_quantity` together. A trigger refuses any other change to `stock_quantity`, including a plain `UPDATE` or an `INSERT` with stock from the SQL Editor; new variants start at 0. Seed data and manual fixes use the function too, e.g. in the SQL Editor:
  ```sql
  select private.apply_stock_movement((select id from public.product_variants where sku = 'oud-malaki'), 5, 'receive', 'تصحيح يدوي: استلام');
  select private.apply_stock_movement((select id from public.product_variants where sku = 'oud-malaki'), -2, 'damage', 'زجاجتان مكسورتان');
  ```
  A negative delta that would go below 0 fails (check constraint). Staff never read `stock_quantity` directly (column grant); the admin reads it through `admin_*` functions.
- New custom error codes: never `P0000`–`P0004` (Postgres's own; `P0004` is `assert_failure`, which `exception when others` can't catch). Admin codes so far: `P0001` stock / unavailable, `P0006` not found, `P0010` status change not allowed, `P0011` still in use, `P0013` option without values.
- After any schema change, run the Supabase security advisors and fix new findings. Tests for each phase live in `supabase/tests/` (one DO block that ends in a deliberate exception, so it rolls back).
- Clients: `src/lib/supabase/client.ts` (browser) and `src/lib/supabase/server.ts` (server components / route handlers).

## Salon data (temporary static files)

Hours are `WEEK` in `src/lib/salon.ts` (salon time `Asia/Hebron`; `openStatus()` drives the client-only `OpenNow` badge). Services and prices are `src/lib/services.ts`. Both get replaced by the bookings tables (`working_hours`, `services`), see `docs/BOOKINGS-BRIEF.md`.

## Env

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_WHATSAPP_NUMBER` (digits only, international, no +), and server-only `ORDER_GATEWAY_SECRET` (`openssl rand -hex 32`, Sensitive on Vercel; never `NEXT_PUBLIC_`). See `.env.example`. No service-role key is used anywhere.

## Commands

`npm run dev` · `npm run build` · `npm run lint`
