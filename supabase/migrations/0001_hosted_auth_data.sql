create extension if not exists pgcrypto;

create schema if not exists private;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.tester_allowlist (
  email text primary key,
  role text not null default 'tester',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.tester_allowlist enable row level security;

create policy "allow users to read their own allowlist row"
on public.tester_allowlist
for select
to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create or replace function public.is_current_user_allowlisted()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tester_allowlist
    where active = true
      and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "allowlisted users can read their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id and public.is_current_user_allowlisted());

create policy "allowlisted users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id and public.is_current_user_allowlisted())
with check (auth.uid() = id and public.is_current_user_allowlisted());

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_lifetrac_profile on auth.users;
create trigger on_auth_user_created_lifetrac_profile
after insert or update on auth.users
for each row execute function public.handle_new_user_profile();

create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  date_precision text not null default 'exact' check (date_precision in ('exact', 'month', 'range')),
  start_date date not null,
  end_date date,
  tags text[] not null default '{}',
  color text not null default '#4777f5',
  icon text not null default 'book',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memory_items_user_date_idx on public.memory_items (user_id, start_date, end_date);

alter table public.memory_items enable row level security;

create policy "allowlisted users manage own memories"
on public.memory_items
for all
to authenticated
using (auth.uid() = user_id and public.is_current_user_allowlisted())
with check (auth.uid() = user_id and public.is_current_user_allowlisted());

create trigger memory_items_touch_updated_at
before update on public.memory_items
for each row execute function public.touch_updated_at();

create table if not exists public.life_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  start_date date not null,
  end_date date not null,
  color text not null default '#4777f5',
  icon text not null default 'school',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists life_chunks_user_date_idx on public.life_chunks (user_id, start_date, end_date);

alter table public.life_chunks enable row level security;

create policy "allowlisted users manage own life chunks"
on public.life_chunks
for all
to authenticated
using (auth.uid() = user_id and public.is_current_user_allowlisted())
with check (auth.uid() = user_id and public.is_current_user_allowlisted());

create trigger life_chunks_touch_updated_at
before update on public.life_chunks
for each row execute function public.touch_updated_at();

create table if not exists public.task_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  due_date date,
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'done')),
  color text not null default '#4777f5',
  icon text not null default 'calendar',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_items_user_due_idx on public.task_items (user_id, due_date, status);

alter table public.task_items enable row level security;

create policy "allowlisted users manage own tasks"
on public.task_items
for all
to authenticated
using (auth.uid() = user_id and public.is_current_user_allowlisted())
with check (auth.uid() = user_id and public.is_current_user_allowlisted());

create trigger task_items_touch_updated_at
before update on public.task_items
for each row execute function public.touch_updated_at();

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null,
  owner_type text not null check (owner_type in ('memory', 'chunk')),
  file_name text not null,
  original_name text not null,
  mime_type text not null,
  size integer not null check (size >= 0),
  storage_path text not null unique,
  url text,
  created_at timestamptz not null default now()
);

create index if not exists media_assets_owner_idx on public.media_assets (user_id, owner_type, owner_id);

alter table public.media_assets enable row level security;

create policy "allowlisted users manage own media"
on public.media_assets
for all
to authenticated
using (auth.uid() = user_id and public.is_current_user_allowlisted())
with check (auth.uid() = user_id and public.is_current_user_allowlisted());

create table if not exists public.google_calendar_selections (
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_id text not null,
  summary text not null,
  color text not null default '#6aa4ff',
  time_zone text,
  is_primary boolean not null default false,
  selected boolean not null default true,
  access_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, calendar_id)
);

alter table public.google_calendar_selections enable row level security;

create policy "allowlisted users manage own calendar selections"
on public.google_calendar_selections
for all
to authenticated
using (auth.uid() = user_id and public.is_current_user_allowlisted())
with check (auth.uid() = user_id and public.is_current_user_allowlisted());

create trigger google_calendar_selections_touch_updated_at
before update on public.google_calendar_selections
for each row execute function public.touch_updated_at();

create table if not exists public.google_calendar_events (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_id text not null,
  external_id text not null,
  calendar_summary text not null,
  color text not null default '#6aa4ff',
  title text not null,
  description text not null default '',
  location text not null default '',
  html_link text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  recurring boolean not null default false,
  status text not null default 'confirmed',
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists google_calendar_events_range_idx on public.google_calendar_events (user_id, start_at, end_at);

alter table public.google_calendar_events enable row level security;

create policy "allowlisted users read own calendar events"
on public.google_calendar_events
for select
to authenticated
using (auth.uid() = user_id and public.is_current_user_allowlisted());

create table if not exists private.google_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  token_type text,
  scope text,
  expiry_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz
);

create trigger google_calendar_connections_touch_updated_at
before update on private.google_calendar_connections
for each row execute function public.touch_updated_at();

create table if not exists private.google_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists google_oauth_states_user_idx on private.google_oauth_states (user_id, expires_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "allowlisted users read own media objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_current_user_allowlisted()
);

create policy "allowlisted users upload own media objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_current_user_allowlisted()
);

create policy "allowlisted users update own media objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_current_user_allowlisted()
)
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_current_user_allowlisted()
);

create policy "allowlisted users delete own media objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_current_user_allowlisted()
);
