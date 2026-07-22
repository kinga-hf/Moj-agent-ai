-- W1: persistent storage for the agent.
-- Run this script in Supabase SQL Editor for the selected project.

create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text,
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null,
  content text not null
);

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  preferences jsonb not null default '{}'::jsonb
);

create index if not exists messages_conversation_id_idx
  on public.messages (conversation_id);

create index if not exists conversations_updated_at_idx
  on public.conversations (updated_at desc);

-- W1 intentionally leaves RLS disabled. Enable and configure policies in L07.
alter table public.conversations disable row level security;
alter table public.messages disable row level security;
alter table public.user_profiles disable row level security;
