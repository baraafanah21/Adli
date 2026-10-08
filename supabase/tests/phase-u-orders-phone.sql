-- Phase U: orders_phone_required. Run in the SQL Editor; it ends in a deliberate exception, so nothing is kept.
do $$
declare
  v_ok boolean := false;
begin
  -- No phone: refused.
  begin
    insert into public.orders (idempotency_key, customer_name, items, total_ils, phone)
    values (gen_random_uuid(), 'اختبار', '[{"x":1}]'::jsonb, 0, null);
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL: an order without a phone was accepted'; end if;

  -- With a full number: accepted.
  insert into public.orders (idempotency_key, customer_name, items, total_ils, phone)
  values (gen_random_uuid(), 'اختبار', '[{"x":1}]'::jsonb, 0, '+970599123456');

  raise exception 'OK: phase U orders_phone_required (rolled back)';
end $$;
