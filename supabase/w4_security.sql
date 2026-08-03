-- W4: dane potrzebne do panelu bezpieczeństwa.

create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  message text,
  message_length integer not null default 0 check (message_length >= 0 and message_length <= 2000),
  blocked boolean not null default false,
  block_reason text
);

alter table public.message_logs add column if not exists message text;
alter table public.message_logs add column if not exists blocked boolean not null default false;
alter table public.message_logs add column if not exists block_reason text;

update public.message_logs
set blocked = false
where blocked is null;

create index if not exists message_logs_blocked_created_at_idx
  on public.message_logs (blocked, created_at desc);

alter table public.message_logs enable row level security;
revoke all on public.message_logs from anon, authenticated;

