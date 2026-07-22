-- Warsztat 2 fix: pozwol aplikacji kursowej zarzadzac baza wiedzy.
-- Wklej w Supabase Dashboard -> SQL Editor -> Run, jesli nie uzywasz SUPABASE_SERVICE_ROLE_KEY.

alter table public.documents disable row level security;

-- Alternatywa zamiast wylaczania RLS:
-- alter table public.documents enable row level security;
-- create policy "Allow public knowledge document reads"
--   on public.documents for select
--   to anon
--   using (true);
-- create policy "Allow public knowledge document inserts"
--   on public.documents for insert
--   to anon
--   with check (true);
-- create policy "Allow public knowledge document deletes"
--   on public.documents for delete
--   to anon
--   using (true);
