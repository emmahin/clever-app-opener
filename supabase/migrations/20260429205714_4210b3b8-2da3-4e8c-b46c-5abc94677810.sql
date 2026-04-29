create or replace function public.transfer_primary_admin(_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _caller_is_primary boolean;
  _target_is_admin boolean;
begin
  if _caller is null then
    raise exception 'forbidden: not authenticated';
  end if;

  if _caller = _target_user_id then
    raise exception 'cannot transfer to yourself';
  end if;

  select exists(
    select 1 from public.user_roles
    where user_id = _caller and role = 'admin' and is_primary = true
  ) into _caller_is_primary;

  if not _caller_is_primary then
    raise exception 'forbidden: only the primary admin can transfer this role';
  end if;

  select exists(
    select 1 from public.user_roles
    where user_id = _target_user_id and role = 'admin'
  ) into _target_is_admin;

  if not _target_is_admin then
    raise exception 'target user must already be an admin';
  end if;

  -- Demote current primary, promote target. Partial unique index allows only
  -- one primary at a time, so demote first.
  update public.user_roles
    set is_primary = false
    where user_id = _caller and role = 'admin';

  update public.user_roles
    set is_primary = true, granted_by = _caller, granted_at = now()
    where user_id = _target_user_id and role = 'admin';

  return jsonb_build_object('ok', true, 'new_primary', _target_user_id);
end;
$$;

revoke execute on function public.transfer_primary_admin(uuid) from public, anon;
grant execute on function public.transfer_primary_admin(uuid) to authenticated;