create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, email, approved, is_admin)
  values (new.id, new.email, false, false)
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.user_profiles (user_id, email, approved, is_admin)
select u.id, u.email, false, false
from auth.users u
left join public.user_profiles p on p.user_id = u.id
where p.user_id is null;