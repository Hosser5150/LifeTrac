-- Optional production scheduler setup.
-- Run manually after deploying the calendar-refresh-scheduled Edge Function.
-- Replace the placeholders with your project ref and a long random SCHEDULED_SYNC_SECRET.
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'lifetrac-google-calendar-sync',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/calendar-refresh-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-lifetrac-sync-secret', '<SCHEDULED_SYNC_SECRET>'
    ),
    body := jsonb_build_object('source', 'supabase-cron')
  );
  $$
);
