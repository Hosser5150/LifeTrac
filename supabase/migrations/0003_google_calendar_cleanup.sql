update public.google_calendar_selections
set selected = false,
    updated_at = now()
where is_primary = false;

delete from public.google_calendar_events
where title = 'Untitled Google event'
   or not exists (
     select 1
     from public.google_calendar_selections selection
     where selection.user_id = google_calendar_events.user_id
       and selection.calendar_id = google_calendar_events.calendar_id
       and selection.selected = true
   );
