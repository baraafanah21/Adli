-- Fix: «transition not allowed» used SQLSTATE P0004, which Postgres reserves for assert_failure. An
-- `exception when others` block never catches assert_failure, so any PL/pgSQL caller (and the F1 test) stopped there.
-- Same function, same behaviour, error code P0010. Nothing else changes; nothing is dropped.

create or replace function public.admin_set_order_status(p_order_id uuid, p_status text, p_note text default null)
returns table (status text, changed boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_from text;
begin
  if not private.has_role(array['owner', 'staff']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('new', 'confirmed', 'done', 'cancelled') then
    raise exception 'status_invalid' using errcode = '22023';
  end if;

  select o.status into v_from from public.orders o where o.id = p_order_id for update;
  if v_from is null then
    raise exception 'order_not_found' using errcode = 'P0006';
  end if;

  if v_from = p_status then
    return query select v_from, false;
    return;
  end if;

  if not ((v_from = 'new' and p_status in ('confirmed', 'cancelled'))
          or (v_from = 'confirmed' and p_status in ('done', 'cancelled'))) then
    raise exception 'invalid_transition' using errcode = 'P0010', detail = v_from || '->' || p_status;
  end if;

  if p_status = 'confirmed' then
    perform private.take_order_stock(p_order_id);
  elsif p_status = 'cancelled' and v_from = 'confirmed' then
    perform private.return_order_stock(p_order_id);
  end if;

  update public.orders o set status = p_status where o.id = p_order_id;
  insert into public.order_events (order_id, from_status, to_status, actor, note)
  values (p_order_id, v_from, p_status, (select auth.uid()), nullif(btrim(p_note), ''));

  return query select p_status, true;
end $$;

-- create or replace keeps the grants (execute: authenticated only).
