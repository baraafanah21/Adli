# Accounts, roles and permissions

Guests can always order. An account is optional: it keeps the customer's details, lists their orders, and lets them review products they received.

## Who is who

| Principal | How they're identified | Notes |
|---|---|---|
| Guest | No session | Browses, orders through `/api/orders`. |
| Customer | Supabase Auth session (Google, magic link, or email + password) | A `profiles` row is created on sign-up. |
| Staff | Customer + `user_roles.role = 'staff'` | Runs the shop day to day. |
| Owner | Customer + `user_roles.role = 'owner'` | Everything. There is always at least one owner. |

Roles are read from `user_roles` on every check (`private.has_role()`), never from the token, so removing a role takes effect at once.

## Permission matrix

| Action | Guest | Customer | Staff | Owner |
|---|:-:|:-:|:-:|:-:|
| Browse catalog, read approved reviews | ✓ | ✓ | ✓ | ✓ |
| Place an order (rate-limited) | ✓ | ✓ | ✓ | ✓ |
| Edit own profile, see own orders | | ✓ | ✓ | ✓ |
| Review a product they received (pending until approved) | | ✓ | ✓ | ✓ |
| See and change any order's status | | | ✓ | ✓ |
| Products, categories, images, stock | | | ✓ | ✓ |
| Moderate and reply to reviews | | | ✓ | ✓ |
| Low-stock list | | | ✓ | ✓ |
| Money stats (sales, averages, top products, by area) | | | | ✓ |
| Add or remove staff | | | | ✓ |

## Where it's enforced (all three, on purpose)

1. **Proxy** (`src/proxy.ts`): refreshes the session; unauthenticated requests to `/account/*` and `/admin/*` go to `/login`. Coarse only.
2. **Server**: the `/admin` layout and **every** Server Action call `requireRole()` (`src/lib/auth/guards.ts`) with `supabase.auth.getUser()`.
3. **Database**: RLS on every table and role checks inside every security-definer function. This is the floor: a bug above it still can't leak or change data.

## Orders

- Created only through `/api/orders` → `place_order()`. The function requires a server-held gateway secret (so the browser can't call it directly), recomputes prices from the database, rate-limits per IP (5/min) and per user, and is idempotent on `idempotency_key`.
- Lines live in `order_items` (with name and price snapshots).
- Status machine: `new → confirmed | cancelled`, `confirmed → done | cancelled`. Confirming takes stock; cancelling a confirmed order returns it (one transaction, logged in `stock_movements`).

## Reviews

- One review per customer per product: 1–5 stars and an optional comment (≤ 1000 characters).
- Only a customer with an order in status `done` that contains the product can review it.
- New and edited reviews are `pending` and invisible to the public until staff or the owner approves them. Staff or owner can reject or reply.
- The public sees the reviewer's first name only.
