import { handleCors, json } from "../_shared/cors.ts";
import { syncEventsForRange } from "../_shared/google.ts";
import { HttpError, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const expected = Deno.env.get("SCHEDULED_SYNC_SECRET");
    if (!expected || req.headers.get("x-lifetrac-sync-secret") !== expected) {
      throw new HttpError("Unauthorized scheduled sync", 401);
    }

    const client = serviceClient();
    const { data: connections, error } = await client.from("google_calendar_connections_private").select("user_id");
    if (error) {
      throw new HttpError(error.message, 500);
    }

    const start = offsetDate(-14);
    const end = offsetDate(90);
    const results = [];
    for (const connection of connections || []) {
      try {
        if (!(await isAllowlistedUser(client, connection.user_id))) {
          results.push({ ok: false, skipped: true, userId: connection.user_id });
          continue;
        }
        const events = await syncEventsForRange(client, connection.user_id, start, end);
        results.push({ eventCount: events.length, ok: true, userId: connection.user_id });
      } catch (issue) {
        results.push({ error: issue instanceof Error ? issue.message : "Sync failed", ok: false, userId: connection.user_id });
      }
    }

    return json({ range: { end, start }, results, syncedAt: new Date().toISOString() });
  } catch (issue) {
    return json({ error: issue instanceof Error ? issue.message : "Scheduled sync failed" }, { status: issue instanceof HttpError ? issue.status : 500 });
  }
});

function offsetDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function isAllowlistedUser(client: ReturnType<typeof serviceClient>, userId: string) {
  const { data: profile } = await client.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (!profile?.email) {
    return false;
  }
  const { data: allowlistRow } = await client.from("tester_allowlist").select("email").ilike("email", profile.email).eq("active", true).maybeSingle();
  return Boolean(allowlistRow);
}
