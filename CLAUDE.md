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
- Tables: `categories`, `products`, `orders`, `order_items`, `admins` (becomes `user_roles` in Phase C). RLS is on for all. The public reads categories and active products only. `private.*` holds server-only state (`app_secrets`, `order_rate_hits`) and is never exposed.
- Orders are created ONLY through `POST /api/orders` (`src/app/api/orders/route.ts`), which calls `place_order(p_idempotency_key, p_customer_name, p_area, p_phone, p_items, p_client_ip, p_gateway_secret)` with the server-only `ORDER_GATEWAY_SECRET` (its SHA-256 is in `private.app_secrets`; a direct browser RPC call is refused). It recomputes prices, rate-limits 5 orders/minute per IP, and returns `{code, total_ils, items}`. Error codes: `P0001` unavailable (DETAIL = `[{id, name_ar}]`), `P0002` rate limited, `22023` invalid, `42501` bad secret.
- The cart is `src/lib/cart-store.ts` (localStorage) with `useCart()` / `useCartUI()` from `src/components/cart/CartContext.tsx`. The order sheet generates one idempotency key per checkout attempt (sessionStorage, rotated when the cart changes), then builds the message with `buildOrderMessage()` and opens `whatsappUrl()` from `src/lib/whatsapp.ts` in the same tab.
- Admin = a row in `public.admins` (user_id). `private.is_admin()` backs the write policies.
- After any schema change, run the Supabase security advisors and fix new findings.
- Clients: `src/lib/supabase/client.ts` (browser) and `src/lib/supabase/server.ts` (server components / route handlers).

## Env

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_WHATSAPP_NUMBER` (digits only, international, no +), and server-only `ORDER_GATEWAY_SECRET` (`openssl rand -hex 32`, Sensitive on Vercel; never `NEXT_PUBLIC_`). See `.env.example`. No service-role key is used anywhere.

## Commands

`npm run dev` · `npm run build` · `npm run lint`
