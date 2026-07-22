-- W3: Supabase Auth, user isolation and cleanup.
-- Run in Supabase Dashboard -> SQL Editor.

alter table public.conversations
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.documents
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

delete from public.messages
where conversation_id in (
  select id from public.conversations where user_id is null
);

delete from public.conversations where user_id is null;
delete from public.documents where user_id is null;
delete from public.user_profiles
where not exists (
  select 1 from auth.users where users.id = user_profiles.id
);

alter table public.conversations
  alter column user_id set not null;

create index if not exists conversations_user_id_updated_at_idx
  on public.conversations (user_id, updated_at desc);

create index if not exists documents_user_id_created_at_idx
  on public.documents (user_id, created_at desc);

alter table public.user_profiles
  alter column id drop default;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_id_auth_users_fk'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_id_auth_users_fk
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.documents enable row level security;
alter table public.user_profiles enable row level security;

drop policy if exists "Users can read own conversations" on public.conversations;
drop policy if exists "Users can insert own conversations" on public.conversations;
drop policy if exists "Users can update own conversations" on public.conversations;
drop policy if exists "Users can delete own conversations" on public.conversations;

create policy "Users can read own conversations"
  on public.conversations for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own conversations"
  on public.conversations for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on public.conversations for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own conversations"
  on public.conversations for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own messages" on public.messages;
drop policy if exists "Users can insert own messages" on public.messages;
drop policy if exists "Users can delete own messages" on public.messages;

create policy "Users can read own messages"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

create policy "Users can insert own messages"
  on public.messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

create policy "Users can delete own messages"
  on public.messages for delete
  to authenticated
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage own documents" on public.documents;

create policy "Users can manage own documents"
  on public.documents for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own profile" on public.user_profiles;

create policy "Users can manage own profile"
  on public.user_profiles for all
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.user_profiles to authenticated;

notify pgrst, 'reload schema';
