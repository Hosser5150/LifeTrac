import { handleCors, json } from "../_shared/cors.ts";
import { calendarEnvConfigured, calendarRedirectUri } from "../_shared/google.ts";
import { HttpError, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { client, user } = await requireUser(req);
    const { data: connection, error: connectionError } = await client
      .from("google_calendar_connections_private")
      .select("last_synced_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (connectionError) {
      throw new HttpError(connectionError.message, 500);
    }

    const { data: calendars, error: calendarError } = await client
      .from("google_calendar_selections")
      .select("*")
      .eq("user_id", user.id)
      .order("is_primary", { ascending: false });
    if (calendarError) {
      throw new HttpError(calendarError.message, 500);
    }

    return json({
      calendars: (calendars || []).map((calendar) => ({
        accessRole: calendar.access_role,
        color: calendar.color,
        id: calendar.calendar_id,
        primary: calendar.is_primary,
        selected: calendar.selected,
        summary: calendar.summary,
        timeZone: calendar.time_zone
      })),
      configured: calendarEnvConfigured(),
      connected: Boolean(connection),
      lastSyncedAt: connection?.last_synced_at || null,
      redirectUri: calendarRedirectUri()
    });
  } catch (issue) {
    return json({ error: issue instanceof Error ? issue.message : "Could not read Calendar status" }, { status: issue instanceof HttpError ? issue.status : 500 });
  }
});
