import { handleCors, json } from "../_shared/cors.ts";
import { getConnection, refreshAccessToken, syncCalendarList } from "../_shared/google.ts";
import { HttpError, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { client, user } = await requireUser(req);
    const connection = await getConnection(client, user.id);
    const accessToken = await refreshAccessToken(client, connection);
    return json(await syncCalendarList(client, user.id, accessToken));
  } catch (issue) {
    return json({ error: issue instanceof Error ? issue.message : "Could not refresh Google calendars" }, { status: issue instanceof HttpError ? issue.status : 500 });
  }
});
