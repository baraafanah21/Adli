-- Phase D: RLS and column grants on the catalog tables. Run in the SQL Editor.
-- One DO block that ends with a deliberate exception: everything it creates (two fake users, a role, an option
-- value) is rolled back. The results are the exception message («RLS TESTS (rolled back)»), one line per check.
-- Expected with the Phase D data: A1 12, A2 12, A3 0, A4 0, A5 0, A6 0, A7 12, A8 12, A9–A12 refused;
-- C1 12, C2 0, C3/C4/C7 refused, C5/C6 0 rows; S1 14, S2 7, S3 2, S4 5, S5 2,
-- S6 «out:سوداء، مقاس L, in:-», S7/S8 1 row, S9 refused (column grant), S10 refused (trigger).

do $t$
declare
  r text := '';
  n int;
  s text;
  staff uuid := gen_random_uuid();
  cust uuid := gen_random_uuid();
  opt uuid;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (staff, 'authenticated', 'authenticated', 'rls-staff@test.invalid', now(), now()),
         (cust,  'authenticated', 'authenticated', 'rls-cust@test.invalid',  now(), now());
  insert into public.user_roles (user_id, role) values (staff, 'owner');
  select o.id into opt from public.product_options o join public.products p on p.id = o.product_id
   where p.slug = 'demo-cap' and o.name_ar = 'المقاس';

  ---------------- anon ----------------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from public.products; r := r || 'A1 anon products=' || n || E'\n';
  select count(*) into n from public.product_variants; r := r || 'A2 anon variants=' || n || E'\n';
  select count(*) into n from public.product_variants where sku like 'demo-%'; r := r || 'A3 anon demo variants=' || n || E'\n';
  select count(*) into n from public.product_options; r := r || 'A4 anon options=' || n || E'\n';
  select count(*) into n from public.product_option_values; r := r || 'A5 anon option values=' || n || E'\n';
  select count(*) into n from public.bundle_items; r := r || 'A6 anon bundle items=' || n || E'\n';
  select count(*) into n from public.variant_availability; r := r || 'A7 anon availability rows=' || n || E'\n';
  select count(*) into n from public.product_variants where stock_state in ('in', 'low', 'out'); r := r || 'A8 anon reads stock_state rows=' || n || E'\n';
  begin
    select sum(stock_quantity) into n from public.product_variants; r := r || 'A9 FAIL anon read stock_quantity' || E'\n';
  exception when insufficient_privilege then r := r || 'A9 anon stock_quantity refused (42501)' || E'\n'; end;
  begin
    insert into public.product_option_values (option_id, label_ar) values (opt, 'XL'); r := r || 'A10 FAIL anon insert' || E'\n';
  exception when insufficient_privilege then r := r || 'A10 anon insert refused (' || sqlstate || ')' || E'\n'; end;
  begin
    update public.product_variants set sort = sort; r := r || 'A11 FAIL anon update' || E'\n';
  exception when insufficient_privilege then r := r || 'A11 anon update refused (' || sqlstate || ')' || E'\n'; end;
  begin
    delete from public.bundle_items; r := r || 'A12 FAIL anon delete' || E'\n';
  exception when insufficient_privilege then r := r || 'A12 anon delete refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  ---------------- signed-in customer (no role) ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.products; r := r || 'C1 customer products=' || n || E'\n';
  select count(*) into n from public.product_variants where sku like 'demo-%'; r := r || 'C2 customer demo variants=' || n || E'\n';
  begin
    select sum(stock_quantity) into n from public.product_variants; r := r || 'C3 FAIL customer read stock_quantity' || E'\n';
  exception when insufficient_privilege then r := r || 'C3 customer stock_quantity refused (42501)' || E'\n'; end;
  begin
    insert into public.product_option_values (option_id, label_ar) values (opt, 'XL'); r := r || 'C4 FAIL customer insert' || E'\n';
  exception when insufficient_privilege then r := r || 'C4 customer insert refused by RLS (' || sqlstate || ')' || E'\n'; end;
  update public.product_variants set sort = sort; get diagnostics n = row_count; r := r || 'C5 customer update rows=' || n || E'\n';
  delete from public.bundle_items; get diagnostics n = row_count; r := r || 'C6 customer delete rows=' || n || E'\n';
  begin
    insert into public.categories (slug, name_ar) values ('rls-test', 'اختبار'); r := r || 'C7 FAIL customer insert category' || E'\n';
  exception when insufficient_privilege then r := r || 'C7 customer insert category refused (' || sqlstate || ')' || E'\n'; end;
  reset role;

  ---------------- staff (owner) ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.products; r := r || 'S1 staff products=' || n || E'\n';
  select count(*) into n from public.product_variants where sku like 'demo-%'; r := r || 'S2 staff demo variants=' || n || E'\n';
  select count(*) into n from public.product_options; r := r || 'S3 staff options=' || n || E'\n';
  select count(*) into n from public.product_option_values; r := r || 'S4 staff option values=' || n || E'\n';
  select count(*) into n from public.bundle_items; r := r || 'S5 staff bundle items=' || n || E'\n';
  select string_agg(a.stock_state || ':' || coalesce(a.label_ar, '-'), ', ' order by v.sku) into s
    from public.variant_availability a join public.product_variants v on v.id = a.variant_id
    where v.sku in ('demo-cap-black-l', 'demo-gift-box');
  r := r || 'S6 staff availability: ' || s || E'\n';
  insert into public.product_option_values (option_id, label_ar) values (opt, 'XL'); get diagnostics n = row_count; r := r || 'S7 staff insert option value rows=' || n || E'\n';
  update public.product_variants set sort = sort where sku = 'demo-cap-navy-m'; get diagnostics n = row_count; r := r || 'S8 staff update variant rows=' || n || E'\n';
  begin
    select sum(stock_quantity) into n from public.product_variants; r := r || 'S9 staff read stock_quantity=' || n || E'\n';
  exception when insufficient_privilege then r := r || 'S9 staff stock_quantity refused too (column grant; Phase F needs an admin view)' || E'\n'; end;
  begin
    insert into public.product_option_values (option_id, label_ar, hex) values (opt, 'XXL', '#000000'); r := r || 'S10 FAIL hex on a size value accepted' || E'\n';
  exception when check_violation then r := r || 'S10 hex on a size value refused (' || sqlerrm || ')' || E'\n'; end;
  reset role;

  raise exception E'RLS TESTS (rolled back)\n%', r;
end $t$;
