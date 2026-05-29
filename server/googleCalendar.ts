import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { GoogleCalendarEvent, GoogleCalendarStatus, GoogleCalendarSummary } from "../shared/types";
import {
  DEFAULT_OWNER_ID,
  googleCalendarConnections,
  googleCalendarEvents,
  googleCalendarSelections,
  googleOauthStates,
  type AppDb
} from "./db";

const CONNECTION_ID = "local-google-calendar";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_API_ROOT = "https://www.googleapis.com/calendar/v3";

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type GoogleCalendarListEntry = {
  id?: string;
  summary?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  timeZone?: string;
  primary?: boolean;
  accessRole?: string;
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarListEntry[];
  nextPageToken?: string;
};

type GoogleEventResource = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  recurringEventId?: string;
  updated?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

type GoogleEventListResponse = {
  items?: GoogleEventResource[];
  nextPageToken?: string;
};

export function getGoogleCalendarConfig() {
  const apiOrigin = `http://127.0.0.1:${process.env.PORT || 4174}`;

  return {
    appOrigin: process.env.LIFETRAC_APP_ORIGIN || "http://127.0.0.1:5173",
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${apiOrigin}/api/integrations/google/callback`
  };
}

export function getGoogleCalendarStatus(appDb: AppDb): GoogleCalendarStatus {
  const config = getGoogleCalendarConfig();
  const connection = getConnection(appDb);

  return {
    configured: Boolean(config.clientId && config.clientSecret),
    connected: Boolean(connection),
    redirectUri: config.redirectUri,
    calendars: getCachedGoogleCalendars(appDb),
    lastSyncedAt: connection?.lastSyncedAt || null
  };
}

export function getCachedGoogleCalendars(appDb: AppDb): GoogleCalendarSummary[] {
  return appDb
    .select()
    .from(googleCalendarSelections)
    .where(eq(googleCalendarSelections.ownerId, DEFAULT_OWNER_ID))
    .all()
    .map((calendar) => ({
      id: calendar.calendarId,
      summary: calendar.summary,
      color: calendar.color,
      timeZone: calendar.timeZone,
      primary: Boolean(calendar.primary),
      selected: Boolean(calendar.selected),
      accessRole: calendar.accessRole
    }))
    .sort((left, right) => Number(right.primary) - Number(left.primary) || left.summary.localeCompare(right.summary));
}

export function createGoogleAuthorizationUrl(appDb: AppDb) {
  const config = requireGoogleConfig();
  const state = randomBytes(24).toString("base64url");
  const now = new Date();

  appDb.delete(googleOauthStates).where(lt(googleOauthStates.expiresAt, now.toISOString())).run();
  appDb
    .insert(googleOauthStates)
    .values({
      state,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString()
    })
    .run();

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPE);
  url.searchParams.set("state", state);

  return url.toString();
}

export async function completeGoogleAuthorization(appDb: AppDb, code: string, state: string) {
  const storedState = appDb.select().from(googleOauthStates).where(eq(googleOauthStates.state, state)).get();
  appDb.delete(googleOauthStates).where(eq(googleOauthStates.state, state)).run();

  if (!storedState || storedState.expiresAt < new Date().toISOString()) {
    throw httpError("Google connection state expired. Start the connection again.", 400);
  }

  const token = await exchangeAuthorizationCode(code);
  storeToken(appDb, token);
  await refreshGoogleCalendarList(appDb);
}

export async function refreshGoogleCalendarList(appDb: AppDb) {
  const accessToken = await getAccessToken(appDb);
  const calendars: GoogleCalendarListEntry[] = [];
  let pageToken = "";

  do {
    const url = new URL(`${GOOGLE_API_ROOT}/users/me/calendarList`);
    url.searchParams.set("maxResults", "250");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetchGoogleJson<GoogleCalendarListResponse>(url, accessToken);
    calendars.push(...(response.items || []));
    pageToken = response.nextPageToken || "";
  } while (pageToken);

  const previous = new Map(getCachedGoogleCalendars(appDb).map((calendar) => [calendar.id, calendar.selected]));
  const readable = calendars.filter((calendar): calendar is GoogleCalendarListEntry & { id: string } => Boolean(calendar.id));
  const shouldSelectFallback = !readable.some((calendar) => previous.get(calendar.id) || calendar.primary);
  const now = new Date().toISOString();

  appDb.delete(googleCalendarSelections).where(eq(googleCalendarSelections.ownerId, DEFAULT_OWNER_ID)).run();

  if (readable.length) {
    appDb
      .insert(googleCalendarSelections)
      .values(
        readable.map((calendar, index) => ({
          calendarId: calendar.id,
          ownerId: DEFAULT_OWNER_ID,
          summary: calendar.summary || "Untitled calendar",
          color: calendar.backgroundColor || "#5b84ff",
          timeZone: calendar.timeZone || null,
          primary: calendar.primary ? 1 : 0,
          selected: previous.has(calendar.id) ? Number(previous.get(calendar.id)) : Number(Boolean(calendar.primary || (shouldSelectFallback && index === 0))),
          accessRole: calendar.accessRole || null,
          createdAt: now,
          updatedAt: now
        }))
      )
      .run();
  }

  touchConnectionSync(appDb, now);
  return getCachedGoogleCalendars(appDb);
}

export function selectGoogleCalendars(appDb: AppDb, selectedIds: string[]) {
  const selected = new Set(selectedIds);
  const calendars = getCachedGoogleCalendars(appDb);
  calendars.forEach((calendar) => {
    appDb
      .update(googleCalendarSelections)
      .set({ selected: selected.has(calendar.id) ? 1 : 0, updatedAt: new Date().toISOString() })
      .where(eq(googleCalendarSelections.calendarId, calendar.id))
      .run();
  });

  return getCachedGoogleCalendars(appDb);
}

export async function fetchGoogleCalendarEvents(appDb: AppDb, start: string, end: string) {
  if (!isDateOnly(start) || !isDateOnly(end) || start >= end) {
    throw httpError("Provide an ISO start date and an exclusive end date.", 400);
  }

  const accessToken = await getAccessToken(appDb);
  const selectedCalendars = getCachedGoogleCalendars(appDb).filter((calendar) => calendar.selected);
  const batches = await Promise.all(selectedCalendars.map((calendar) => fetchCalendarEventRange(appDb, accessToken, calendar, start, end)));
  const refreshedAt = new Date().toISOString();
  touchConnectionSync(appDb, refreshedAt);

  return {
    events: batches.flat().sort((left, right) => left.start.localeCompare(right.start) || left.title.localeCompare(right.title)),
    refreshedAt
  };
}

export function disconnectGoogleCalendar(appDb: AppDb) {
  appDb.delete(googleCalendarEvents).run();
  appDb.delete(googleCalendarSelections).where(eq(googleCalendarSelections.ownerId, DEFAULT_OWNER_ID)).run();
  appDb.delete(googleCalendarConnections).where(eq(googleCalendarConnections.id, CONNECTION_ID)).run();
}

export function normalizeGoogleCalendarEvent(calendar: GoogleCalendarSummary, resource: GoogleEventResource): GoogleCalendarEvent | null {
  const start = resource.start?.dateTime || resource.start?.date;
  const end = resource.end?.dateTime || resource.end?.date || start;
  if (!resource.id || !start || !end || resource.status === "cancelled") {
    return null;
  }

  return {
    id: cacheEventId(calendar.id, resource.id, start),
    externalId: resource.id,
    calendarId: calendar.id,
    calendarSummary: calendar.summary,
    color: calendar.color,
    title: resource.summary || "Untitled event",
    description: resource.description || "",
    location: resource.location || "",
    htmlLink: resource.htmlLink || null,
    start,
    end,
    allDay: Boolean(resource.start?.date && !resource.start?.dateTime),
    recurring: Boolean(resource.recurringEventId),
    status: resource.status || "confirmed"
  };
}

async function fetchCalendarEventRange(
  appDb: AppDb,
  accessToken: string,
  calendar: GoogleCalendarSummary,
  start: string,
  end: string
) {
  const resources: GoogleEventResource[] = [];
  let pageToken = "";

  do {
    const url = new URL(`${GOOGLE_API_ROOT}/calendars/${encodeURIComponent(calendar.id)}/events`);
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("timeMin", `${start}T00:00:00.000Z`);
    url.searchParams.set("timeMax", `${end}T00:00:00.000Z`);
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetchGoogleJson<GoogleEventListResponse>(url, accessToken);
    resources.push(...(response.items || []));
    pageToken = response.nextPageToken || "";
  } while (pageToken);

  const events = resources
    .map((resource) => normalizeGoogleCalendarEvent(calendar, resource))
    .filter((event): event is GoogleCalendarEvent => Boolean(event));

  appDb
    .delete(googleCalendarEvents)
    .where(and(eq(googleCalendarEvents.calendarId, calendar.id), lt(googleCalendarEvents.start, end), gt(googleCalendarEvents.end, start)))
    .run();

  if (events.length) {
    const fetchedAt = new Date().toISOString();
    appDb
      .insert(googleCalendarEvents)
      .values(
        events.map((event) => ({
          id: event.id,
          calendarId: event.calendarId,
          externalId: event.externalId,
          title: event.title,
          description: event.description,
          location: event.location,
          htmlLink: event.htmlLink,
          start: event.start,
          end: event.end,
          allDay: event.allDay ? 1 : 0,
          recurring: event.recurring ? 1 : 0,
          status: event.status,
          sourceUpdatedAt: resources.find((resource) => resource.id === event.externalId)?.updated || null,
          fetchedAt
        }))
      )
      .onConflictDoUpdate({
        target: googleCalendarEvents.id,
        set: { fetchedAt }
      })
      .run();
  }

  return events;
}

async function exchangeAuthorizationCode(code: string) {
  const config = requireGoogleConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri
  });

  return postToken(body);
}

async function refreshAccessToken(refreshToken: string) {
  const config = requireGoogleConfig();
  return postToken(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  );
}

async function postToken(body: URLSearchParams): Promise<GoogleTokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST"
  });
  const payload = (await response.json()) as GoogleTokenResponse & { error_description?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    throw httpError(payload.error_description || payload.error || "Google token exchange failed.", 502);
  }

  return payload;
}

async function getAccessToken(appDb: AppDb) {
  const connection = getConnection(appDb);
  if (!connection) {
    throw httpError("Connect Google Calendar first.", 409);
  }

  const needsRefresh = !connection.expiryDate || Date.parse(connection.expiryDate) - Date.now() < 60_000;
  if (!needsRefresh) {
    return connection.accessToken;
  }

  if (!connection.refreshToken) {
    throw httpError("Google Calendar access expired. Reconnect Google Calendar.", 409);
  }

  const token = await refreshAccessToken(connection.refreshToken);
  storeToken(appDb, token);
  return token.access_token;
}

async function fetchGoogleJson<T>(url: URL, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const payload = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw httpError(payload.error?.message || "Google Calendar request failed.", response.status >= 400 && response.status < 500 ? 409 : 502);
  }

  return payload;
}

function storeToken(appDb: AppDb, token: GoogleTokenResponse) {
  const existing = getConnection(appDb);
  const now = new Date().toISOString();
  appDb
    .insert(googleCalendarConnections)
    .values({
      id: CONNECTION_ID,
      ownerId: DEFAULT_OWNER_ID,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || existing?.refreshToken || null,
      expiryDate: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
      scope: token.scope || existing?.scope || null,
      tokenType: token.token_type || existing?.tokenType || null,
      lastSyncedAt: existing?.lastSyncedAt || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: googleCalendarConnections.id,
      set: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token || existing?.refreshToken || null,
        expiryDate: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
        scope: token.scope || existing?.scope || null,
        tokenType: token.token_type || existing?.tokenType || null,
        updatedAt: now
      }
    })
    .run();
}

function touchConnectionSync(appDb: AppDb, lastSyncedAt: string) {
  appDb
    .update(googleCalendarConnections)
    .set({ lastSyncedAt, updatedAt: lastSyncedAt })
    .where(eq(googleCalendarConnections.id, CONNECTION_ID))
    .run();
}

function getConnection(appDb: AppDb) {
  return appDb.select().from(googleCalendarConnections).where(eq(googleCalendarConnections.id, CONNECTION_ID)).get();
}

function requireGoogleConfig() {
  const config = getGoogleCalendarConfig();
  if (!config.clientId || !config.clientSecret) {
    throw httpError("Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET before connecting Google Calendar.", 503);
  }

  return config;
}

function cacheEventId(calendarId: string, eventId: string, start: string) {
  return Buffer.from(`${calendarId}|${eventId}|${start}`).toString("base64url");
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}
