import { HttpError } from "./supabase.ts";

export type CalendarConnection = {
  access_token: string;
  refresh_token: string | null;
  expiry_date: string | null;
  user_id: string;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type GoogleCalendarListItem = {
  accessRole?: string;
  backgroundColor?: string;
  id: string;
  primary?: boolean;
  summary: string;
  summaryOverride?: string;
  timeZone?: string;
};

type GoogleEvent = {
  description?: string;
  end?: { date?: string; dateTime?: string };
  htmlLink?: string;
  id: string;
  location?: string;
  recurringEventId?: string;
  start?: { date?: string; dateTime?: string };
  status?: string;
  summary?: string;
  updated?: string;
};

type CalendarSummary = {
  accessRole: string | null;
  color: string;
  id: string;
  primary: boolean;
  selected: boolean;
  summary: string;
  timeZone: string | null;
};

export function calendarEnvConfigured() {
  return Boolean(
    Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") &&
      Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") &&
      Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI")
  );
}

export function calendarRedirectUri() {
  return Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI") || "";
}

export function appOrigin() {
  return Deno.env.get("LIFETRAC_APP_ORIGIN") || "http://127.0.0.1:5173";
}

export async function exchangeCodeForTokens(code: string) {
  const body = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
    code,
    grant_type: "authorization_code",
    redirect_uri: requiredEnv("GOOGLE_CALENDAR_REDIRECT_URI")
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST"
  });

  if (!response.ok) {
    throw new HttpError(`Google token exchange failed: ${await response.text()}`, 502);
  }

  return response.json() as Promise<GoogleTokenResponse>;
}

export async function refreshAccessToken(client: SupabaseServiceClient, connection: CalendarConnection) {
  const expiry = connection.expiry_date ? new Date(connection.expiry_date).getTime() : 0;
  if (expiry > Date.now() + 60_000) {
    return connection.access_token;
  }

  if (!connection.refresh_token) {
    throw new HttpError("Google Calendar refresh token is missing. Disconnect and reconnect Calendar.", 409);
  }

  const body = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: connection.refresh_token
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST"
  });

  if (!response.ok) {
    throw new HttpError(`Google token refresh failed: ${await response.text()}`, 502);
  }

  const token = (await response.json()) as GoogleTokenResponse;
  const expiryDate = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  const { error } = await client
    .from("google_calendar_connections_private")
    .update({
      access_token: token.access_token,
      expiry_date: expiryDate,
      scope: token.scope,
      token_type: token.token_type
    })
    .eq("user_id", connection.user_id);

  if (error) {
    throw new HttpError(error.message, 500);
  }

  return token.access_token;
}

export async function upsertConnection(client: SupabaseServiceClient, userId: string, token: GoogleTokenResponse) {
  const { data: existing } = await client.from("google_calendar_connections_private").select("refresh_token").eq("user_id", userId).maybeSingle();
  const expiryDate = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  const { error } = await client.from("google_calendar_connections_private").upsert({
    access_token: token.access_token,
    expiry_date: expiryDate,
    refresh_token: token.refresh_token || existing?.refresh_token || null,
    scope: token.scope,
    token_type: token.token_type,
    user_id: userId
  });

  if (error) {
    throw new HttpError(error.message, 500);
  }
}

export async function getConnection(client: SupabaseServiceClient, userId: string) {
  const { data, error } = await client.from("google_calendar_connections_private").select("*").eq("user_id", userId).maybeSingle();
  if (error) {
    throw new HttpError(error.message, 500);
  }
  if (!data) {
    throw new HttpError("Google Calendar is not connected", 409);
  }
  return data as CalendarConnection;
}

export async function syncCalendarList(client: SupabaseServiceClient, userId: string, accessToken: string) {
  const response = await googleApi<{ items?: GoogleCalendarListItem[] }>("https://www.googleapis.com/calendar/v3/users/me/calendarList", accessToken);
  const items = response.items || [];
  const { data: existing, error: existingError } = await client.from("google_calendar_selections").select("calendar_id, selected").eq("user_id", userId);
  if (existingError) {
    throw new HttpError(existingError.message, 500);
  }
  const selectedById = new Map((existing || []).map((row: { calendar_id: string; selected: boolean }) => [row.calendar_id, row.selected]));
  const rows = items.map((item) => ({
    access_role: item.accessRole || null,
    calendar_id: item.id,
    color: item.backgroundColor || "#6aa4ff",
    is_primary: Boolean(item.primary),
    selected: selectedById.get(item.id) ?? Boolean(item.primary),
    summary: item.summaryOverride || item.summary,
    time_zone: item.timeZone || null,
    user_id: userId
  }));

  if (rows.length) {
    const { error } = await client.from("google_calendar_selections").upsert(rows, { onConflict: "user_id,calendar_id" });
    if (error) {
      throw new HttpError(error.message, 500);
    }
  }

  return rows.map((row) => ({
    accessRole: row.access_role,
    color: row.color,
    id: row.calendar_id,
    primary: row.is_primary,
    selected: row.selected,
    summary: row.summary,
    timeZone: row.time_zone
  })) satisfies CalendarSummary[];
}

export async function syncEventsForRange(client: SupabaseServiceClient, userId: string, start: string, end: string) {
  const connection = await getConnection(client, userId);
  const accessToken = await refreshAccessToken(client, connection);
  const { data: calendars, error } = await client.from("google_calendar_selections").select("*").eq("user_id", userId).eq("selected", true);
  if (error) {
    throw new HttpError(error.message, 500);
  }

  const startIso = toRangeIso(start, "start");
  const endIso = toRangeIso(end, "end");
  const selectedCalendarIds = (calendars || []).map((calendar) => calendar.calendar_id);
  const rows = [];

  if (!selectedCalendarIds.length) {
    return [];
  }

  for (const calendar of calendars || []) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.calendar_id)}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", startIso);
    url.searchParams.set("timeMax", endIso);

    const result = await googleApi<{ items?: GoogleEvent[] }>(url.toString(), accessToken);
    const normalized = (result.items || [])
      .filter((event) => event.status !== "cancelled" && hasVisibleTitle(event))
      .map((event) => normalizeEvent(userId, calendar, event));

    await client
      .from("google_calendar_events")
      .delete()
      .eq("user_id", userId)
      .eq("calendar_id", calendar.calendar_id)
      .lt("start_at", endIso)
      .gt("end_at", startIso);

    if (normalized.length) {
      const { error: upsertError } = await client.from("google_calendar_events").upsert(normalized, { onConflict: "user_id,id" });
      if (upsertError) {
        throw new HttpError(upsertError.message, 500);
      }
      rows.push(...normalized);
    }
  }

  const { error: stampError } = await client
    .from("google_calendar_connections_private")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (stampError) {
    throw new HttpError(stampError.message, 500);
  }

  const { data: cached, error: cachedError } = await client
    .from("google_calendar_events")
    .select("*")
    .eq("user_id", userId)
    .in("calendar_id", selectedCalendarIds)
    .lt("start_at", endIso)
    .gt("end_at", startIso)
    .order("start_at", { ascending: true });
  if (cachedError) {
    throw new HttpError(cachedError.message, 500);
  }

  return (cached || []).map((row) => ({
    allDay: row.all_day,
    calendarId: row.calendar_id,
    calendarSummary: row.calendar_summary,
    color: row.color,
    description: row.description,
    end: row.all_day ? row.end_at.slice(0, 10) : row.end_at,
    externalId: row.external_id,
    htmlLink: row.html_link,
    id: row.id,
    location: row.location,
    recurring: row.recurring,
    start: row.all_day ? row.start_at.slice(0, 10) : row.start_at,
    status: row.status,
    title: row.title
  }));
}

async function googleApi<T>(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new HttpError(`Google Calendar request failed: ${await response.text()}`, 502);
  }

  return response.json() as Promise<T>;
}

function normalizeEvent(userId: string, calendar: Record<string, string>, event: GoogleEvent) {
  const allDay = Boolean(event.start?.date);
  const startAt = allDay ? `${event.start?.date}T00:00:00.000Z` : event.start?.dateTime || new Date().toISOString();
  const endAt = allDay ? `${event.end?.date || event.start?.date}T00:00:00.000Z` : event.end?.dateTime || event.start?.dateTime || startAt;

  return {
    all_day: allDay,
    calendar_id: calendar.calendar_id,
    calendar_summary: calendar.summary,
    color: calendar.color || "#6aa4ff",
    description: event.description || "",
    end_at: endAt,
    external_id: event.id,
    fetched_at: new Date().toISOString(),
    html_link: event.htmlLink || null,
    id: `${calendar.calendar_id}:${event.id}`,
    location: event.location || "",
    recurring: Boolean(event.recurringEventId),
    source_updated_at: event.updated || null,
    start_at: startAt,
    status: event.status || "confirmed",
    title: event.summary?.trim() || "Untitled Google event",
    user_id: userId
  };
}

function hasVisibleTitle(event: GoogleEvent) {
  return Boolean(event.summary?.trim());
}

function toRangeIso(value: string, side: "start" | "end") {
  if (value.includes("T")) {
    return value;
  }
  return `${value}T00:00:00.000Z`;
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new HttpError(`${name} is not configured`, 500);
  }
  return value;
}

type SupabaseServiceClient = {
  auth: unknown;
  from: (table: string) => any;
  schema: (schema: string) => { from: (table: string) => any };
};
