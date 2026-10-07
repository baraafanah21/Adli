-- Phase F6: deleting a product (owner only): a real delete without history, archive with history, restore, the
-- active-bundle refusal (P0014), archived products frozen (P0015), WebP-only image paths. Run in the SQL Editor after
-- 20261007001000_product_archive_image_webp.sql. One DO block ending in a deliberate exception: everything is rolled
-- back. Each line is one check; a line starting with FAIL is a failure.

do $t$
declare
  r text := '';
  n int;
  res jsonb;
  owner1 uuid := gen_random_uuid();
  staff uuid := gen_random_uuid();
  v_caps uuid;
  v_gifts uuid;
  p_plain uuid;
  p_seed uuid;
  p_sold uuid;
  p_moved uuid;
  p_piece uuid;
  p_box uuid;
  v_var uuid;
  v_piece_var uuid;
  v_order uuid;
  v_detail text;
  as_owner text;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (owner1, 'authenticated', 'authenticated', 'f6-owner@test.invalid', now(), now()),
    (staff,  'authenticated', 'authenticated', 'f6-staff@test.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (owner1, 'owner'), (staff, 'staff');
  select id into v_caps from public.categories where slug = 'caps';
  select id into v_gifts from public.categories where slug = 'gift-boxes';
  as_owner := json_build_object('sub', owner1, 'role', 'authenticated')::text;

  -- Staff create a product, but can't delete or restore one ------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  p_plain := public.admin_create_product('simple', v_caps, 'طاقية بلا تاريخ', 'f6-plain', 30);
  begin
    perform public.admin_delete_product(p_plain); r := r || 'FAIL staff deleted a product' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_delete_product refused (' || sqlstate || ')' || E'\n'; end;
  begin
    perform public.admin_restore_product(p_plain); r := r || 'FAIL staff restored a product' || E'\n';
  exception when insufficient_privilege then r := r || 'staff admin_restore_product refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  -- No history: deleted for real, variants included ---------------------------------------------------------------
  perform set_config('request.jwt.claims', as_owner, true);
  set local role authenticated;
  res := public.admin_delete_product(p_plain);
  r := r || 'no history → ' || (res->>'outcome') || ' (expect deleted)' || E'\n';
  reset role;
  select count(*) into n from public.products where id = p_plain; r := r || 'product rows left: ' || n || ' (expect 0)' || E'\n';
  select count(*) into n from public.product_variants where product_id = p_plain; r := r || 'variant rows left: ' || n || ' (expect 0)' || E'\n';

  -- Only an opening balance (seed data, no actor): still deleted, the opening movement goes with it ----------------
  perform set_config('request.jwt.claims', as_owner, true);
  set local role authenticated;
  p_seed := public.admin_create_product('simple', v_caps, 'طاقية برصيد افتتاحي', 'f6-seed', 30);
  reset role;
  select id into v_var from public.product_variants where product_id = p_seed;
  perform set_config('request.jwt.claims', '{}', true);
  perform private.apply_stock_movement(v_var, 4, 'adjust', 'رصيد افتتاحي');
  perform set_config('request.jwt.claims', as_owner, true);
  set local role authenticated;
  res := public.admin_delete_product(p_seed);
  r := r || 'opening balance only → ' || (res->>'outcome') || ' (expect deleted)' || E'\n';
  reset role;
  select count(*) into n from public.stock_movements where variant_id = v_var; r := r || 'its movements left: ' || n || ' (expect 0)' || E'\n';

  -- A stock movement (receive): archived ----------------------------------------------------------------------------
  perform set_config('request.jwt.claims', as_owner, true);
  set local role authenticated;
  p_moved := public.admin_create_product('simple', v_caps, 'طاقية مستلمة', 'f6-moved', 30);
  reset role;
  perform private.apply_stock_movement((select id from public.product_variants where product_id = p_moved), 3, 'receive', 'F6');
  set local role authenticated;
  res := public.admin_delete_product(p_moved);
  r := r || 'with a receive movement → ' || (res->>'outcome') || ' (expect archived)' || E'\n';
  reset role;

  -- An order line: archived, hidden, order kept --------------------------------------------------------------------
  perform set_config('request.jwt.claims', as_owner, true);
  set local role authenticated;
  p_sold := public.admin_create_product('simple', v_caps, 'طاقية مباعة', 'f6-sold', 30);
  perform public.admin_update_product(p_sold, 'طاقية مباعة', 'f6-sold', null, null, 30, null, v_caps, 1, true);
  reset role;
  select id into v_var from public.product_variants where product_id = p_sold;
  insert into public.orders (idempotency_key, customer_name, total_ils) values (gen_random_uuid(), 'زبون F6', 30)
  returning id into v_order;
  insert into public.order_items (order_id, product_id, variant_id, name_ar, unit_price_ils, qty)
  values (v_order, p_sold, v_var, 'طاقية مباعة', 30, 1);

  set local role authenticated;
  res := public.admin_delete_product(p_sold);
  r := r || 'with an order → ' || (res->>'outcome') || ' (expect archived)' || E'\n';
  select count(*) into n from public.admin_stock_levels(null, 'f6-sold', null);
  r := r || 'archived in admin_stock_levels: ' || n || ' (expect 0)' || E'\n';
  begin
    perform public.admin_delete_product(p_sold); r := r || 'FAIL archived product deleted again' || E'\n';
  exception when sqlstate 'P0015' then r := r || 'delete of an archived product refused (P0015)' || E'\n'; end;
  begin
    perform public.admin_update_product(p_sold, 'طاقية مباعة', 'f6-sold', null, null, 30, null, v_caps, 1, true);
    r := r || 'FAIL archived product shown again by admin_update_product' || E'\n';
  exception when sqlstate 'P0015' then r := r || 'admin_update_product on archived refused (P0015)' || E'\n'; end;
  begin
    perform public.admin_set_product_image(p_sold, p_sold::text || '/' || gen_random_uuid()::text || '.webp');
    r := r || 'FAIL photo set on an archived product' || E'\n';
  exception when sqlstate 'P0015' then r := r || 'admin_set_product_image on archived refused (P0015)' || E'\n'; end;
  reset role;
  select count(*) into n from public.products where id = p_sold and archived_at is not null and archived_by = owner1 and not is_active;
  r := r || 'archived, hidden, archived_by set: ' || n || ' (expect 1)' || E'\n';
  select count(*) into n from public.order_items where order_id = v_order and product_id = p_sold and variant_id = v_var;
  r := r || 'order line kept: ' || n || ' (expect 1)' || E'\n';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from public.products where id = p_sold; r := r || 'anon sees archived: ' || n || ' (expect 0)' || E'\n';
  reset role;

  -- Restore: back in the admin, still hidden; deleting again archives again -----------------------------------------
  perform set_config('request.jwt.claims', as_owner, true);
  set local role authenticated;
  perform public.admin_restore_product(p_sold);
  reset role;
  select count(*) into n from public.products where id = p_sold and archived_at is null and archived_by is null and not is_active;
  r := r || 'restored and still hidden: ' || n || ' (expect 1)' || E'\n';
  set local role authenticated;
  select count(*) into n from public.admin_stock_levels(null, 'f6-sold', null);
  r := r || 'restored in admin_stock_levels: ' || n || ' (expect 1)' || E'\n';
  begin
    perform public.admin_restore_product(p_sold); r := r || 'FAIL restored a product that is not archived' || E'\n';
  exception when sqlstate 'P0006' then r := r || 'restore of a live product refused (P0006)' || E'\n'; end;
  res := public.admin_delete_product(p_sold);
  r := r || 'restored product deleted again → ' || (res->>'outcome') || ' (expect archived)' || E'\n';

  -- Photos: .webp only -------------------------------------------------------------------------------------------
  p_piece := public.admin_create_product('simple', v_caps, 'قطعة بكجة', 'f6-piece', 20);
  begin
    perform public.admin_set_product_image(p_piece, p_piece::text || '/' || gen_random_uuid()::text || '.png');
    r := r || 'FAIL .png path accepted' || E'\n';
  exception when sqlstate '22023' then r := r || '.png path refused (22023)' || E'\n'; end;
  perform public.admin_set_product_image(p_piece, p_piece::text || '/' || gen_random_uuid()::text || '.webp');
  r := r || '.webp path accepted' || E'\n';

  -- Bundles: an active bundle blocks (P0014 with its name); a hidden one makes it history (archive) ----------------
  select id into v_piece_var from public.product_variants where product_id = p_piece;
  p_box := public.admin_create_product('bundle', v_gifts, 'بكجة F6', 'f6-box', 0);
  perform public.admin_set_bundle(p_box, 50, jsonb_build_array(jsonb_build_object('variant_id', v_piece_var, 'qty', 1)));
  perform public.admin_update_product(p_box, 'بكجة F6', 'f6-box', null, null, 50, null, v_gifts, 1, true);
  begin
    perform public.admin_delete_product(p_piece); r := r || 'FAIL piece of an active bundle deleted' || E'\n';
  exception when sqlstate 'P0014' then
    get stacked diagnostics v_detail = pg_exception_detail;
    r := r || 'piece of an active bundle refused (P0014), detail: ' || v_detail || E'\n';
  end;
  perform public.admin_update_product(p_box, 'بكجة F6', 'f6-box', null, null, 50, null, v_gifts, 1, false);
  res := public.admin_delete_product(p_piece);
  r := r || 'piece of a hidden bundle → ' || (res->>'outcome') || ' (expect archived)' || E'\n';
  begin
    perform public.admin_set_bundle(p_box, 50, jsonb_build_array(jsonb_build_object('variant_id', v_piece_var, 'qty', 2)));
    r := r || 'FAIL archived piece put in a bundle' || E'\n';
  exception when sqlstate 'P0015' then r := r || 'archived piece in a bundle refused (P0015)' || E'\n'; end;
  -- The bundle itself has no history: deleted, and its lines with it.
  res := public.admin_delete_product(p_box);
  r := r || 'bundle without history → ' || (res->>'outcome') || ' (expect deleted)' || E'\n';
  reset role;
  select count(*) into n from public.bundle_items where bundle_product_id = p_box; r := r || 'bundle lines left: ' || n || ' (expect 0)' || E'\n';

  raise exception E'F6 TESTS (rolled back)\n%', r;
end $t$;
