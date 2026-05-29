import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const memoryItems = sqliteTable("memory_items", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  datePrecision: text("date_precision", { enum: ["exact", "month", "range"] }).notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const lifeChunks = sqliteTable("life_chunks", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const mediaAssets = sqliteTable("media_assets", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  ownerType: text("owner_type", { enum: ["memory", "chunk"] }).notNull(),
  fileName: text("file_name").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  url: text("url").notNull(),
  createdAt: text("created_at").notNull()
});

export const taskItems = sqliteTable("task_items", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  dueDate: text("due_date"),
  recurrence: text("recurrence", { enum: ["none", "daily", "weekly", "monthly", "yearly"] }).notNull(),
  priority: text("priority", { enum: ["low", "medium", "high"] }).notNull(),
  status: text("status", { enum: ["open", "done"] }).notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at")
});

export const googleCalendarConnections = sqliteTable("google_calendar_connections", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiryDate: text("expiry_date"),
  scope: text("scope"),
  tokenType: text("token_type"),
  lastSyncedAt: text("last_synced_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const googleCalendarSelections = sqliteTable("google_calendar_selections", {
  calendarId: text("calendar_id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  summary: text("summary").notNull(),
  color: text("color").notNull(),
  timeZone: text("time_zone"),
  primary: integer("is_primary").notNull(),
  selected: integer("selected").notNull(),
  accessRole: text("access_role"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const googleCalendarEvents = sqliteTable("google_calendar_events", {
  id: text("id").primaryKey(),
  calendarId: text("calendar_id").notNull(),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  htmlLink: text("html_link"),
  start: text("start_at").notNull(),
  end: text("end_at").notNull(),
  allDay: integer("all_day").notNull(),
  recurring: integer("recurring").notNull(),
  status: text("status").notNull(),
  sourceUpdatedAt: text("source_updated_at"),
  fetchedAt: text("fetched_at").notNull()
});

export const googleOauthStates = sqliteTable("google_oauth_states", {
  state: text("state").primaryKey(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull()
});
