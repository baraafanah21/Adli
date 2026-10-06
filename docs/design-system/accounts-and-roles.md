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

## Admin database functions

Every admin write, and every admin read that needs data the API roles can't see (stock quantities, other people's orders with their history), is a `public.admin_*` function: `security definer`, `set search_path = ''`, `execute` revoked from `public` and `anon` and granted to `authenticated`, and a role check (`private.has_role(...)`) as its first statement, so a signed-in customer gets `42501`.

The Supabase advisor reports these as `authenticated_security_definer_function_executable`. That is expected: they must be callable by signed-in staff, and the role check inside is what protects them. (`place_order` is reported for `anon` too; it is protected by the server-held gateway secret.)

| Function | Roles | Since |
|---|---|---|
| `admin_set_order_status(order_id, status, note)` | owner, staff | F1 |
| `admin_orders(status, from, to, q, limit, offset)` | owner, staff | F1 |
| `admin_order(code)` | owner, staff | F1 |
| `admin_new_orders_count()` | owner, staff | F1 |
| `admin_create_product(kind, category_id, name_ar, slug, price_ils)` | owner, staff | F2 |
| `admin_update_product(id, name_ar, slug, family_ar, description_ar, price_ils, volume_ml, category_id, sort, is_active)` | owner, staff | F2 |
| `admin_set_product_image(id, path)` | owner, staff | F2 |
| `admin_save_option(product_id, option_id, name_ar, kind, sort)` / `admin_delete_option(option_id)` | owner, staff | F2 |
| `admin_save_option_value(option_id, value_id, label_ar, hex, sort)` / `admin_delete_option_value(value_id)` | owner, staff | F2 |
| `admin_generate_variants(product_id)` | owner, staff | F2 |
| `admin_update_variant(variant_id, sku, label_ar, price_ils, low_stock_threshold, is_active, sort)` | owner, staff | F2 |
| `admin_variant_stock(product_id)` | owner, staff | F2 |
| `admin_set_bundle(product_id, price_ils, items)` | owner, staff | F2 |
| `admin_stock_levels(filter, q, category_id)` | owner, staff | F3 |
| `admin_adjust_stock(variant_id, reason, quantity, note)` | owner, staff | F3 |
| `admin_stock_movements(variant_id, limit)` | owner, staff | F3 |
| `admin_save_category(id, slug, name_ar, icon, description_ar, sort, is_active)` | owner | F4 |
| `admin_staff()` | owner | F4 |
| `admin_add_staff(email, role, is_barber)` | owner | F4 |
| `admin_update_staff(user_id, role, is_barber)` | owner | F4 |
| `admin_remove_staff(user_id)` | owner | F4 |

Error codes the admin maps to messages: `42501` no permission, `22023` invalid input, `P0001` not enough stock (DETAIL lists each piece with needed and available), `P0003` last owner (the keep_one_owner trigger), `P0005` no account with this email, `P0012` already staff, `P0010` status change not allowed (not P0004: Postgres reserves it for assert_failure, which `exception when others` never catches), `P0006` not found, `P0011` option or value still used by a variant, `P0013` an option has no values yet, `23505` slug / sku / name taken, `23514` a check or integrity trigger (the constraint name is in the message; `src/lib/admin/errors.ts` maps each one).

## Orders

- Created only through `/api/orders` → `place_order()`. The function requires a server-held gateway secret (so the browser can't call it directly), recomputes prices from the database, rate-limits per IP (5/min) and per user, and is idempotent on `idempotency_key`.
- Lines live in `order_items` (with name and price snapshots).
- Status machine: `new → confirmed | cancelled`, `confirmed → done | cancelled`, only through `admin_set_order_status()`; the same status again changes nothing. Confirming takes stock (a bundle's pieces); cancelling a confirmed order returns exactly what it took (one transaction, logged in `stock_movements`). Each change is a row in `order_events` (from, to, who, when, note). A confirmed order's lines are never edited: cancel it and place a new one.

## Reviews

- One review per customer per product: 1–5 stars and an optional comment (≤ 1000 characters).
- Only a customer with an order in status `done` that contains the product can review it.
- New and edited reviews are `pending` and invisible to the public until staff or the owner approves them. Staff or owner can reject or reply.
- The public sees the reviewer's first name only.
