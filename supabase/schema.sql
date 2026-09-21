-- Run this once in your Supabase project's SQL Editor (Dashboard → SQL Editor
-- → New query → paste this whole file → Run). Safe to re-run — everything is
-- idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- ── projects ────────────────────────────────────────────────────────────
create table if not exists public.projects (
  slug        text primary key,
  title       text not null,
  summary     text not null default '',
  tags        text[] not null default '{}',
  type        text not null default 'Project',
  order_num   integer not null default 999,
  featured    boolean not null default false,
  date        date not null default current_date,
  content     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.projects enable row level security;
-- No policies are added on purpose. Row Level Security with zero policies
-- means the anon/public API key can read or write NOTHING in this table.
-- The admin panel talks to Supabase using the service_role key (server-side
-- only, never sent to the browser), which bypasses RLS entirely. This is
-- what makes the public Supabase URL safe to have in the client bundle.

-- ── site_settings — always exactly one row (id = 1) ────────────────────
create table if not exists public.site_settings (
  id          integer primary key default 1,
  name        text not null default '',
  role        text not null default '',
  tagline     text not null default '',
  bio         text not null default '',
  location    text not null default '',
  email       text not null default '',
  socials     jsonb not null default '{}',
  skills      text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  constraint site_settings_single_row check (id = 1)
);

alter table public.site_settings enable row level security;
-- Same reasoning as above: no policies, so only service_role can touch it.

insert into public.site_settings (id) values (1)
  on conflict (id) do nothing;

-- ── storage bucket for the CV (public read, admin-only write) ──────────
insert into storage.buckets (id, name, public)
  values ('cv', 'cv', true)
  on conflict (id) do nothing;
-- `public = true` lets anyone fetch a file by its public URL (that's how
-- visitors download your CV) without needing any API key. Uploading,
-- replacing or deleting files still requires the service_role key, which is
-- only ever used server-side by the /admin CV upload route — no storage
-- policies are added for anon/authenticated, so public write is impossible.
