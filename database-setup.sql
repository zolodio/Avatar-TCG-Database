-- ================================================================
--  Run this ONE TIME in:
--  Supabase Dashboard → SQL Editor → New Query → paste → Run
-- ================================================================

create table if not exists public.collections (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        references auth.users(id) on delete cascade not null,
  physical   jsonb       not null default '{}'::jsonb,
  digital    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint collections_user_id_unique unique (user_id)
);

-- Auto-bump updated_at on every save
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists set_updated_at on public.collections;
create trigger set_updated_at
  before update on public.collections
  for each row execute function public.handle_updated_at();

-- Security: each user can only read/write their own row
alter table public.collections enable row level security;

drop policy if exists "Own data only" on public.collections;
create policy "Own data only"
  on public.collections for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
