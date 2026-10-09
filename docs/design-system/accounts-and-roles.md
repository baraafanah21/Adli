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
| Book an appointment, cancel own until 2 hours before | | ✓ | ✓ | ✓ |
| Calendar, walk-ins, booking statuses, clear a no-show flag | | | ✓ | ✓ |
| Close times (breaks, days off) | | | own barber | ✓ (any barber or the whole salon) |
| Barbers, services and prices, opening hours | | | | ✓ |

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
| `admin_add_staff(email, role)` | owner | F4 (is_barber dropped in E3) |
| `admin_update_staff(user_id, role)` | owner | F4 (is_barber dropped in E3) |
| `admin_remove_staff(user_id)` | owner | F4 |
| `admin_owner_dashboard(period)` | owner | F5 |
| `admin_sales_daily(days)` | owner | F5 |
| `admin_staff_summary()` | owner, staff | F5 |
| `admin_set_booking_status(booking_id, status, note)` | owner, staff | E1 |
| `admin_clear_flag(user_id, note)` | owner, staff | E1 |
| `admin_bookings_day(day)` / `admin_bookings_summary()` / `admin_open_flags()` | owner, staff | E3 |
| `admin_add_walk_in(barber_id, service_id, starts_at, name, phone)` | owner, staff | E3 |
| `admin_close_time(barber_id, starts_at, ends_at, reason)` / `admin_save_weekly_closure(…)` / `admin_delete_closure(id)` | owner (any barber or the whole salon); staff linked to a barber (that barber only) | E3 |
| `admin_barbers()` / `admin_save_barber(id, name_ar, user_id, is_active, sort)` | owner | E3 |
| `admin_save_service(id, slug, name_ar, price_ils, duration_min, bookable_online, sort, is_active)` | owner | E3 |
| `admin_save_salon_hours(weekday, open, close)` | owner | E3 |
| `admin_delete_product(id)` / `admin_restore_product(id)` | owner | F6 |
| `admin_upcoming_bookings()` / `admin_bookings_badges()` / `admin_mark_bookings_seen()` | owner, staff | E3.1 |
| `admin_customers(q, filter, limit, offset)` / `admin_customer(user_id)` | owner, staff (totals: owner only, null for staff) | E3.2 |
| `admin_reset_booking_rate(user_id)` / `admin_set_customer_note(user_id, note)` | owner, staff | E3.2 |
| `admin_block_customer(user_id, reason)` / `admin_unblock_customer(user_id, note)` | owner | E3.2 |
| `admin_gallery_items()` | owner | U5.3 |
| `admin_gallery_add(id, kind, aspect, storage_path, poster_path, sm_path, width, height, duration_ms, bytes)` | owner | U5.3 |
| `admin_gallery_set_published(id, published)` | owner | U5.3 |
| `admin_gallery_set_featured(id)` | owner | U5.3 |
| `admin_gallery_reorder(ids)` | owner | U5.3 |
| `admin_gallery_delete(id)` | owner | U5.3 |

Error codes the admin maps to messages: `42501` no permission, `22023` invalid input, `P0001` not enough stock (DETAIL lists each piece with needed and available), `P0003` last owner (the keep_one_owner trigger), `P0005` no account with this email, `P0012` already staff, `P0010` status change not allowed (not P0004: Postgres reserves it for assert_failure, which `exception when others` never catches), `P0006` not found, `P0011` option or value still used by a variant, `P0013` an option has no values yet, `P0014` product in a shown bundle (DETAIL = bundle names), `P0015` product archived (frozen until restored), `P0029` customer blocked (create_booking, place_order), `P0030` already blocked, `P0020`–`P0028` bookings (see `CLAUDE.md`, «Bookings»), `23505` slug / sku / name taken, `23514` a check or integrity trigger (the constraint name is in the message; `src/lib/admin/errors.ts` maps each one).

## Orders

- Created only through `/api/orders` → `place_order()`. The function requires a server-held gateway secret (so the browser can't call it directly), recomputes prices from the database, rate-limits per IP (5/min) and per user, and is idempotent on `idempotency_key`.
- Lines live in `order_items` (with name and price snapshots).
- Status machine: `new → confirmed | cancelled`, `confirmed → done | cancelled`, only through `admin_set_order_status()`; the same status again changes nothing. Confirming takes stock (a bundle's pieces); cancelling a confirmed order returns exactly what it took (one transaction, logged in `stock_movements`). Each change is a row in `order_events` (from, to, who, when, note). A confirmed order's lines are never edited: cancel it and place a new one.

## Bookings

- An account is required. Created only through `/api/bookings` → `create_booking()` (gateway secret, signed in, idempotent on `idempotency_key`, 5 per account per hour). Free times come from `booking_availability(service_id, barber_id)`, which anyone may call: it returns free start times only, never who booked or why a time is taken.
- The customer reads their own bookings and their own no-show flag, and cancels with `cancel_my_booking()` until 2 hours before. Staff read all bookings, events, closures and flags, and change statuses with `admin_set_booking_status()`; only staff or the owner clear a flag (`admin_clear_flag()`, who and when are kept). Each change is a row in `booking_events`.
- `booking_availability` is reported by the advisor for `anon` (`anon_security_definer_function_executable`); expected, it exposes free times only.

## Reviews

- One review per customer per product: 1–5 stars and an optional comment (≤ 1000 characters).
- Only a customer with an order in status `done` that contains the product can review it.
- New and edited reviews are `pending` and invisible to the public until staff or the owner approves them. Staff or owner can reject or reply.
- The public sees the reviewer's first name only.
