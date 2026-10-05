-- Keep is_admin() out of the exposed API (it was reachable at /rest/v1/rpc/is_admin).
-- Policies reference the function by OID, so they keep working after the move.
-- place_order() stays public on purpose: it is the only way the public creates an order.
create schema if not exists private;
grant usage on schema private to anon, authenticated;
alter function public.is_admin() set schema private;
