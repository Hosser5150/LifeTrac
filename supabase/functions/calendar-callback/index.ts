import { handleCors, redirect } from "../_shared/cors.ts";
import { appOrigin, exchangeCodeForTokens, refreshAccessToken, syncCalendarList, upsertConnection } from "../_shared/google.ts";
import { HttpError, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const fallback = appOrigin();
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const googleError = url.searchParams.get("error");

    if (googleError) {
      throw new HttpError(googleError, 400);
    }
    if (!code || !state) {
      throw new HttpError("Missing Google callback code or state", 400);
    }

    const client = serviceClient();
    const { data: oauthState, error: stateError } = await client
      .from("google_oauth_states_private")
      .select("*")
      .eq("state", state)
      .gt("expires_at", new Date().toISOString())
      .is("consumed_at", null)
      .maybeSingle();

    if (stateError) {
      throw new HttpError(stateError.message, 500);
    }
    if (!oauthState) {
      throw new HttpError("Google OAuth state is invalid or expired", 400);
    }

    const token = await exchangeCodeForTokens(code);
    await upsertConnection(client, oauthState.user_id, token);
    await client.from("google_oauth_states_private").update({ consumed_at: new Date().toISOString() }).eq("state", state);

    const connection = await client.from("google_calendar_connections_private").select("*").eq("user_id", oauthState.user_id).single();
    if (!connection.data) {
      throw new HttpError("Calendar connection was not saved", 500);
    }

    const accessToken = await refreshAccessToken(client, connection.data);
    await syncCalendarList(client, oauthState.user_id, accessToken);

    const returnTo = new URL(oauthState.redirect_to || fallback);
    returnTo.searchParams.set("google", "connected");
    return redirect(returnTo.toString());
  } catch (issue) {
    const returnTo = new URL(fallback);
    returnTo.searchParams.set("google", "error");
    returnTo.searchParams.set("reason", issue instanceof Error ? issue.message : "Google Calendar connection failed");
    return redirect(returnTo.toString());
  }
});
