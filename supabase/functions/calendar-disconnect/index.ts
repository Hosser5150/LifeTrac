import { handleCors, json } from "../_shared/cors.ts";
import { HttpError, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { client, user } = await requireUser(req);
    await client.from("google_calendar_connections_private").delete().eq("user_id", user.id);
    await client.from("google_oauth_states_private").delete().eq("user_id", user.id);
    await client.from("google_calendar_events").delete().eq("user_id", user.id);
    await client.from("google_calendar_selections").delete().eq("user_id", user.id);
    return json({ ok: true });
  } catch (issue) {
    return json({ error: issue instanceof Error ? issue.message : "Could not disconnect Google Calendar" }, { status: issue instanceof HttpError ? issue.status : 500 });
  }
});
