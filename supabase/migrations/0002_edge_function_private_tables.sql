create table if not exists public.google_calendar_connections_private (
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

alter table public.google_calendar_connections_private enable row level security;

create trigger google_calendar_connections_private_touch_updated_at
before update on public.google_calendar_connections_private
for each row execute function public.touch_updated_at();

create table if not exists public.google_oauth_states_private (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

alter table public.google_oauth_states_private enable row level security;

create index if not exists google_oauth_states_private_user_idx on public.google_oauth_states_private (user_id, expires_at);

insert into public.google_calendar_connections_private (
  user_id,
  access_token,
  refresh_token,
  token_type,
  scope,
  expiry_date,
  created_at,
  updated_at,
  last_synced_at
)
select
  user_id,
  access_token,
  refresh_token,
  token_type,
  scope,
  expiry_date,
  created_at,
  updated_at,
  last_synced_at
from private.google_calendar_connections
on conflict (user_id) do update
set
  access_token = excluded.access_token,
  refresh_token = coalesce(excluded.refresh_token, public.google_calendar_connections_private.refresh_token),
  token_type = excluded.token_type,
  scope = excluded.scope,
  expiry_date = excluded.expiry_date,
  updated_at = now(),
  last_synced_at = excluded.last_synced_at;

insert into public.google_oauth_states_private (
  state,
  user_id,
  redirect_to,
  created_at,
  expires_at,
  consumed_at
)
select
  state,
  user_id,
  redirect_to,
  created_at,
  expires_at,
  consumed_at
from private.google_oauth_states
on conflict (state) do update
set consumed_at = excluded.consumed_at;
