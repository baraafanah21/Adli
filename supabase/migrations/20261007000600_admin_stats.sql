-- Phase F5: the admin home. Every figure is aggregated here; the browser only gets the totals. Nothing is dropped.
--
-- Sales = orders in status confirmed or done, counted on the day they were placed, in salon time (Asia/Hebron).
-- Periods: 'day' (today), 'week' (since Saturday), 'month' (since the 1st). Each is compared with the same stretch of
-- the period before (today until now vs yesterday until the same hour; this month's first N days vs last month's).
--
--   admin_owner_dashboard(period)  owner  → jsonb {sales, orders, avg, prev_sales, prev_orders, prev_avg, top[], areas[]}
--   admin_sales_daily(days)         owner  → one row per salon day (zeros included), for the chart
--   admin_staff_summary()           owner, staff → jsonb {new_orders, oldest_new_at, to_deliver, low_stock_count,
--                                                          low_stock[]} (no money)

create function private.period_bounds(
  p_period text,
  out cur_start timestamptz, out cur_end timestamptz, out prev_start timestamptz, out prev_end timestamptz
)
language plpgsql stable set search_path = '' as $$
declare
  v_now timestamp := now() at time zone 'Asia/Hebron';
  v_start timestamp;
  v_prev timestamp;
begin
  if p_period = 'day' then
    v_start := date_trunc('day', v_now);
    v_prev := v_start - interval '1 day';
  elsif p_period = 'week' then
    -- The salon's week starts on Saturday (dow 6).
    v_start := date_trunc('day', v_now) - make_interval(days => (extract(dow from v_now)::integer + 1) % 7);
    v_prev := v_start - interval '7 days';
  elsif p_period = 'month' then
    v_start := date_trunc('month', v_now);
    v_prev := v_start - interval '1 month';
  else
    raise exception 'period_invalid' using errcode = '22023';
  end if;
  cur_start := v_start at time zone 'Asia/Hebron';
  cur_end := now();
  prev_start := v_prev at time zone 'Asia/Hebron';
  -- Same elapsed stretch, never running into the current period (a 31-day month after a 28-day one).
  prev_end := least((v_prev + (v_now - v_start)) at time zone 'Asia/Hebron', cur_start);
end $$;

revoke all on function private.period_bounds(text) from public, anon, authenticated;

create function public.admin_owner_dashboard(p_period text default 'month') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  b record;
  v jsonb;
begin
  perform private.require_owner();
  select * into b from private.period_bounds(p_period);

  with sold as (
    select o.id, o.total_ils, o.area, o.created_at
    from public.orders o
    where o.status in ('confirmed', 'done') and o.created_at >= b.prev_start and o.created_at < b.cur_end
  ),
  cur as (select * from sold s where s.created_at >= b.cur_start),
  prev as (select * from sold s where s.created_at < b.prev_end)
  select jsonb_build_object(
    'period', p_period,
    'from', b.cur_start,
    'sales', (select coalesce(sum(total_ils), 0) from cur),
    'orders', (select count(*) from cur),
    'avg', (select coalesce(round(avg(total_ils)), 0) from cur),
    'prev_sales', (select coalesce(sum(total_ils), 0) from prev),
    'prev_orders', (select count(*) from prev),
    'prev_avg', (select coalesce(round(avg(total_ils)), 0) from prev),
    'top', coalesce((
      select jsonb_agg(t order by t.qty desc, t.revenue desc)
      from (
        select i.name_ar, sum(i.qty)::integer as qty, sum(i.qty * i.unit_price_ils)::integer as revenue
        from public.order_items i join cur c on c.id = i.order_id
        group by i.product_id, i.name_ar
        order by qty desc, revenue desc
        limit 5
      ) t), '[]'::jsonb),
    'areas', coalesce((
      select jsonb_agg(a order by a.orders desc, a.sales desc)
      from (
        select coalesce(nullif(btrim(c.area), ''), '') as area, count(*)::integer as orders, sum(c.total_ils)::integer as sales
        from cur c
        group by 1
        order by orders desc, sales desc
        limit 8
      ) a), '[]'::jsonb)
  ) into v;
  return v;
end $$;

create function public.admin_sales_daily(p_days integer default 30)
returns table (day date, sales integer, orders integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'Asia/Hebron')::date;
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
begin
  perform private.require_owner();
  return query
  select d.day, coalesce(sum(o.total_ils), 0)::integer, count(o.id)::integer
  from (select (v_today - g)::date as day from generate_series(0, v_days - 1) g) d
  left join public.orders o
    on o.status in ('confirmed', 'done')
   and o.created_at >= (d.day::timestamp at time zone 'Asia/Hebron')
   and o.created_at < ((d.day + 1)::timestamp at time zone 'Asia/Hebron')
  group by d.day
  order by d.day;
end $$;

create function public.admin_staff_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff();
  return jsonb_build_object(
    'new_orders', (select count(*) from public.orders o where o.status = 'new'),
    'oldest_new_at', (select min(o.created_at) from public.orders o where o.status = 'new'),
    'to_deliver', (select count(*) from public.orders o where o.status = 'confirmed'),
    'low_stock_count', (
      select count(*) from public.product_variants v join public.products p on p.id = v.product_id
      where p.kind = 'simple' and p.is_active and v.is_active and v.stock_quantity <= v.low_stock_threshold),
    'low_stock', coalesce((
      select jsonb_agg(x order by x.qty, x.name_ar)
      from (
        select v.id as variant_id, p.name_ar || coalesce(' ' || private.variant_label(v.id), '') as name_ar,
               v.stock_quantity as qty, v.low_stock_threshold as threshold
        from public.product_variants v join public.products p on p.id = v.product_id
        where p.kind = 'simple' and p.is_active and v.is_active and v.stock_quantity <= v.low_stock_threshold
        order by v.stock_quantity, p.name_ar
        limit 8
      ) x), '[]'::jsonb)
  );
end $$;

revoke all on function
  public.admin_owner_dashboard(text),
  public.admin_sales_daily(integer),
  public.admin_staff_summary()
from public, anon;
grant execute on function
  public.admin_owner_dashboard(text),
  public.admin_sales_daily(integer),
  public.admin_staff_summary()
to authenticated;
