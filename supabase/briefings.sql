-- W1: persistent storage for automated morning briefings.
create extension if not exists pgcrypto;

create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  content text not null,
  date date not null
);

create index if not exists briefings_date_idx
  on public.briefings (date desc);

alter table public.briefings disable row level security;
