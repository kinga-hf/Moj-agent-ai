-- LexAI: foldery/sprawy dla bazy dokumentów.
-- Uruchom ten skrypt w Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.document_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents
  add column if not exists folder_id uuid references public.document_folders(id) on delete set null;

create index if not exists document_folders_user_updated_at_idx
  on public.document_folders (user_id, updated_at desc);

create index if not exists documents_folder_id_created_at_idx
  on public.documents (folder_id, created_at desc);

alter table public.document_folders enable row level security;
alter table public.documents enable row level security;

drop policy if exists "Users can manage own document folders" on public.document_folders;
create policy "Users can manage own document folders"
  on public.document_folders for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own documents" on public.documents;
create policy "Users can manage own documents"
  on public.documents for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.document_folders to authenticated;
grant select, insert, update, delete on public.documents to authenticated;

notify pgrst, 'reload schema';
