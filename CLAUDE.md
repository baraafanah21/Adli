@AGENTS.md

# Adli Salon (عدلي)

Showcase site for a men's barbershop that also sells perfumes and creams. Products are shown in a heavy, theatrical 3D scene; buying means sending a pre-filled WhatsApp message. No online payment, no customer accounts.

Stack: Next.js (App Router, TypeScript) on Vercel · Supabase (Postgres, Storage, Auth for the owner only) · three + @react-three/fiber + drei + postprocessing · gsap ScrollTrigger + lenis.

## Work in order

Follow `docs/ROADMAP.md` phase by phase. Finish and verify one phase (build passes, page checked on a phone width) before starting the next. Tick the boxes in the roadmap as you go. Don't start a later phase's work early.

## Design system (read before any UI work)

- Brand book: `docs/design-system/brand-book.md` (Arabic). 3D + motion rules: `docs/design-system/3d-and-motion.md`. Data + WhatsApp + env: `docs/design-system/build-stack.md`. Components: `docs/design-system/components/<Name>/README.md` with a reference `preview.html`.
- Tokens live in `src/styles/tokens.css` (mirrors `docs/design-system/tokens.json`). Component classes (`ad-btn`, `ad-card`, `ad-seal`, `ad-chip`, `ad-sheet`, `ad-pole`…) in `src/styles/components.css`.
- Never hard-code a color, radius or spacing value in components: use `var(--token)`. Only the 3D scene may read token hex values, via a single `src/lib/brand.ts` constants file.
- Logo colors are fixed: `--forest` #0B300F and `--cream` #F5F5DB. Logo file: `public/brand/logo.jpg` (an SVG is still to come from the owner).
- The signature shape is the seal: a circle with two rings, from the logo. Every product stands on a seal turntable (`SealStage`). Don't invent other signature shapes.
- Fonts: Amiri (display, `latin-mark`) and Readex Pro (everything else), loaded with next/font in `src/app/layout.tsx`.

## Rules

- The site is Arabic and RTL (`<html lang="ar" dir="rtl">`). Use logical CSS properties (`margin-inline-start`, `inset-inline-end`), never left/right, except inside the 3D canvas.
- Copy: plain Arabic, singular polite "you". Action names stay identical through the flow: «أضف للطلب» → «أُضيف للطلب» → «أرسل الطلب على واتساب». Prices `₪ 180`, western digits.
- Only the order button uses `--whatsapp`, with `--on-whatsapp` (dark) text, never white.
- Respect `prefers-reduced-motion`: no camera tweening, static product images.
- Every 3D product must have a transparent PNG fallback; the site must fully work without WebGL.
- Performance budget: product glTF ≤ 300 KB (Draco + KTX2), whole scene ≤ 4 MB, one shared `<Canvas>` for the page, `dpr={[1, 1.75]}`. LCP is the HTML hero title, never the canvas.

## Supabase

- Project ref `hdkmrozwihaoqiqjlzld` (eu-central-1). Migrations in `supabase/migrations/`, applied in order. Add new migrations as new files; never edit an applied one.
- Tables: `categories`, `products`, `orders`, `admins`. RLS is on for all. The public reads categories and active products only.
- Orders are created ONLY by the RPC `place_order(p_idempotency_key uuid, p_customer_name text, p_area text, p_items jsonb)` with items `[{product_id, qty}]`. It recomputes prices from the database and returns `{code, total_ils, items}`. Generate the idempotency key once per checkout attempt (`crypto.randomUUID()`), reuse it on retry.
- Then build the message with `buildOrderMessage()` and open `whatsappUrl()` from `src/lib/whatsapp.ts`.
- Admin = a row in `public.admins` (user_id). `private.is_admin()` backs the write policies.
- After any schema change, run the Supabase security advisors and fix new findings.
- Clients: `src/lib/supabase/client.ts` (browser) and `src/lib/supabase/server.ts` (server components / route handlers).

## Env

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_WHATSAPP_NUMBER` (digits only, international, no +). See `.env.example`. No service-role key is used anywhere.

## Commands

`npm run dev` · `npm run build` · `npm run lint`
