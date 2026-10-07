-- Phase E3: user_roles.is_barber retires. A barber is a row in public.barbers, linked to a staff account through
-- barbers.user_id (managed in «الحلاقون»), so the flag says nothing any more.
--
-- APPLY BY HAND in the SQL Editor (it drops things), after 20261007000800_bookings_admin.sql. Safe in either order
-- with the E3 app deploy: the app no longer sends or reads is_barber.
--
-- Drops: the column public.user_roles.is_barber; the functions admin_staff(), admin_add_staff(text, app_role,
-- boolean) and admin_update_staff(uuid, app_role, boolean), recreated below without is_barber (same names,
-- same behaviour, same grants). No row is deleted.

begin;

drop function public.admin_staff();
drop function public.admin_add_staff(text, public.app_role, boolean);
drop function public.admin_update_staff(uuid, public.app_role, boolean);

alter table public.user_roles drop column is_barber;

create function public.admin_staff()
returns table (user_id uuid, email text, full_name text, role public.app_role, since timestamptz, granted_by_name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_owner();
  return query
  select r.user_id, u.email::text, p.full_name, r.role, r.created_at, coalesce(gp.full_name, gu.email::text)
  from public.user_roles r
  join auth.users u on u.id = r.user_id
  left join public.profiles p on p.id = r.user_id
  left join auth.users gu on gu.id = r.granted_by
  left join public.profiles gp on gp.id = r.granted_by
  order by r.role, coalesce(p.full_name, u.email::text);
end $$;

create function public.admin_add_staff(p_email text, p_role public.app_role)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  perform private.require_owner();
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email)) and u.deleted_at is null;
  if v_user is null then
    raise exception 'no_account' using errcode = 'P0005';
  end if;
  if exists (select 1 from public.user_roles r where r.user_id = v_user) then
    raise exception 'already_staff' using errcode = 'P0012';
  end if;
  insert into public.user_roles (user_id, role, granted_by) values (v_user, p_role, (select auth.uid()));
  return v_user;
end $$;

create function public.admin_update_staff(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_owner();
  update public.user_roles r set role = p_role where r.user_id = p_user_id;   -- keep_one_owner refuses the last owner (P0003)
  if not found then
    raise exception 'staff_not_found' using errcode = 'P0006';
  end if;
end $$;

revoke all on function
  public.admin_staff(),
  public.admin_add_staff(text, public.app_role),
  public.admin_update_staff(uuid, public.app_role)
from public, anon;
grant execute on function
  public.admin_staff(),
  public.admin_add_staff(text, public.app_role),
  public.admin_update_staff(uuid, public.app_role)
to authenticated;

commit;
