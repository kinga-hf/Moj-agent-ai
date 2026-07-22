-- W4: personalizacja profilu i automatyczne tworzenie pustego profilu.
-- Uruchom w Supabase Dashboard -> SQL Editor.

alter table public.user_profiles
  add column if not exists display_name text;

-- Zachowaj imiona zapisane przez wcześniejszą wersję aplikacji.
update public.user_profiles
set display_name = name
where display_name is null
  and name is not null;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, display_name, preferences)
  values (new.id, null, '{}'::jsonb)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();

grant execute on function public.handle_new_user_profile() to postgres, service_role;
