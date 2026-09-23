  -- Network Academy: per-account progress.
  -- Run this once in the Supabase SQL editor (Dashboard > SQL editor > New query).

  create table if not exists public.progress (
    user_id    uuid primary key references auth.users (id) on delete cascade,
    game       jsonb       not null default '{}'::jsonb,  -- XP, stars, streak, topics, badges
    lessons    jsonb       not null default '[]'::jsonb,  -- finished lesson ids
    last       text,                                      -- last lesson opened
    updated_at timestamptz not null default now()
  );

  -- Row level security: a signed-in user can only ever see or change their own row.
  alter table public.progress enable row level security;

  drop policy if exists "progress: read own"   on public.progress;
  drop policy if exists "progress: insert own" on public.progress;
  drop policy if exists "progress: update own" on public.progress;
  drop policy if exists "progress: delete own" on public.progress;

  create policy "progress: read own"   on public.progress for select using (auth.uid() = user_id);
  create policy "progress: insert own" on public.progress for insert with check (auth.uid() = user_id);
  create policy "progress: update own" on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "progress: delete own" on public.progress for delete using (auth.uid() = user_id);

  -- Self-service account deletion. The anon/authenticated client can never delete from auth.users directly, so this
  -- runs as the function owner (security definer) but is hard-wired to auth.uid(): it can only ever delete the
  -- caller's own account, never anyone else's. The progress row above cascades away with it automatically.
  create or replace function public.delete_own_account()
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $$
  begin
    delete from auth.users where id = auth.uid();
  end;
  $$;

  revoke all on function public.delete_own_account() from public;
  grant execute on function public.delete_own_account() to authenticated;
