import { handleCors, json } from "../_shared/cors.ts";
import { HttpError, requireUser } from "../_shared/supabase.ts";
import { appOrigin, calendarEnvConfigured, calendarRedirectUri } from "../_shared/google.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (!calendarEnvConfigured()) {
      throw new HttpError("Google Calendar OAuth is not configured", 500);
    }

    const { client, user } = await requireUser(req);
    const state = crypto.randomUUID();
    const { error } = await client.from("google_oauth_states_private").insert({
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      redirect_to: appOrigin(),
      state,
      user_id: user.id
    });

    if (error) {
      throw new HttpError(error.message, 500);
    }

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("client_id", Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") || "");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("redirect_uri", calendarRedirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.readonly");
    url.searchParams.set("state", state);

    return json({ url: url.toString() });
  } catch (issue) {
    return json({ error: issue instanceof Error ? issue.message : "Could not start Calendar OAuth" }, { status: issue instanceof HttpError ? issue.status : 500 });
  }
});
