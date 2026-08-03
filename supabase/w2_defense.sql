-- W2: obrona wielowarstwowa dla API czatu.

create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  message text,
  message_length integer not null check (message_length >= 0 and message_length <= 2000),
  blocked boolean not null default false,
  block_reason text
);

create index if not exists message_logs_user_created_at_idx
  on public.message_logs (user_id, created_at desc);

alter table public.message_logs enable row level security;

revoke all on public.message_logs from anon, authenticated;
