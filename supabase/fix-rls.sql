-- W1/W2: the app currently uses the public Supabase key without auth.
-- Disable RLS for these learning tables. Add proper policies with auth in L07.

alter table public.conversations disable row level security;
alter table public.messages disable row level security;
alter table public.user_profiles disable row level security;

grant select, insert, update, delete on public.conversations to anon, authenticated;
grant select, insert, update, delete on public.messages to anon, authenticated;
grant select, insert, update, delete on public.user_profiles to anon, authenticated;

notify pgrst, 'reload schema';
