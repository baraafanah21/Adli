-- Phase F4: categories and staff, owner only. Nothing is dropped.
--
--   admin_save_category(id, slug, name_ar, icon, description_ar, sort, is_active) → id (null id = new)
--   admin_staff()                                 → everyone with a role: email, name, role, is_barber, since, granted by
--   admin_add_staff(email, role, is_barber)       → user id; the person must already have an account on the site
--   admin_update_staff(user_id, role, is_barber)
--   admin_remove_staff(user_id)
-- Owner only (staff get 42501). Errors: 23505 / 23514 category slug or icon, P0003 last owner (the trigger from
-- 20261006000500 keeps at least one), P0005 no account with this email, P0006 not found, P0012 already staff.

create function private.require_owner() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role(array['owner']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

revoke all on function private.require_owner() from public, anon, authenticated;

-- Categories ---------------------------------------------------------------------------------------------------

create function public.admin_save_category(
  p_id uuid, p_slug text, p_name_ar text, p_icon text, p_description_ar text, p_sort integer, p_is_active boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_owner();
  if p_id is null then
    insert into public.categories (slug, name_ar, icon, description_ar, sort, is_active)
    values (lower(btrim(p_slug)), btrim(p_name_ar), nullif(btrim(p_icon), ''), nullif(btrim(p_description_ar), ''),
            coalesce(p_sort, (select coalesce(max(c.sort), 0) + 1 from public.categories c)), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.categories c set
      slug = lower(btrim(p_slug)),
      name_ar = btrim(p_name_ar),
      icon = nullif(btrim(p_icon), ''),
      description_ar = nullif(btrim(p_description_ar), ''),
      sort = coalesce(p_sort, c.sort),
      is_active = coalesce(p_is_active, c.is_active)
    where c.id = p_id
    returning c.id into v_id;
    if v_id is null then
      raise exception 'category_not_found' using errcode = 'P0006';
    end if;
  end if;
  return v_id;
end $$;

-- Staff ----------------------------------------------------------------------------------------------------------

create function public.admin_staff()
returns table (
  user_id uuid, email text, full_name text, role public.app_role, is_barber boolean, since timestamptz, granted_by_name text
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_owner();
  return query
  select r.user_id, u.email::text, p.full_name, r.role, r.is_barber, r.created_at, coalesce(gp.full_name, gu.email::text)
  from public.user_roles r
  join auth.users u on u.id = r.user_id
  left join public.profiles p on p.id = r.user_id
  left join auth.users gu on gu.id = r.granted_by
  left join public.profiles gp on gp.id = r.granted_by
  order by r.role, coalesce(p.full_name, u.email::text);
end $$;

create function public.admin_add_staff(p_email text, p_role public.app_role, p_is_barber boolean default false)
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
  insert into public.user_roles (user_id, role, is_barber, granted_by)
  values (v_user, p_role, coalesce(p_is_barber, false), (select auth.uid()));
  return v_user;
end $$;

create function public.admin_update_staff(p_user_id uuid, p_role public.app_role, p_is_barber boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_owner();
  update public.user_roles r set role = p_role, is_barber = coalesce(p_is_barber, r.is_barber)
  where r.user_id = p_user_id;   -- the keep_one_owner trigger refuses demoting the last owner (P0003)
  if not found then
    raise exception 'staff_not_found' using errcode = 'P0006';
  end if;
end $$;

create function public.admin_remove_staff(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_owner();
  delete from public.user_roles r where r.user_id = p_user_id;   -- the trigger refuses removing the last owner (P0003)
  if not found then
    raise exception 'staff_not_found' using errcode = 'P0006';
  end if;
end $$;

-- Grants ----------------------------------------------------------------------------------------------------------

revoke all on function
  public.admin_save_category(uuid, text, text, text, text, integer, boolean),
  public.admin_staff(),
  public.admin_add_staff(text, public.app_role, boolean),
  public.admin_update_staff(uuid, public.app_role, boolean),
  public.admin_remove_staff(uuid)
from public, anon;
grant execute on function
  public.admin_save_category(uuid, text, text, text, text, integer, boolean),
  public.admin_staff(),
  public.admin_add_staff(text, public.app_role, boolean),
  public.admin_update_staff(uuid, public.app_role, boolean),
  public.admin_remove_staff(uuid)
to authenticated;
