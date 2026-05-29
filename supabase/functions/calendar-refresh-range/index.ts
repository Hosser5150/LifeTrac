import { handleCors, json } from "../_shared/cors.ts";
import { syncEventsForRange } from "../_shared/google.ts";
import { HttpError, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { client, user } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const start = String(body.start || "");
    const end = String(body.end || "");
    if (!/^\d{4}-\d{2}-\d{2}/.test(start) || !/^\d{4}-\d{2}-\d{2}/.test(end)) {
      throw new HttpError("start and end must be ISO date strings", 400);
    }

    return json({
      events: await syncEventsForRange(client, user.id, start, end),
      refreshedAt: new Date().toISOString()
    });
  } catch (issue) {
    return json({ error: issue instanceof Error ? issue.message : "Could not sync Google Calendar range" }, { status: issue instanceof HttpError ? issue.status : 500 });
  }
});
