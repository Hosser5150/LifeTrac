export type DatePrecision = "exact" | "month" | "range";
export type MediaOwnerType = "memory" | "chunk";
export type TaskRecurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "open" | "done";

export interface MediaAsset {
  id: string;
  ownerId: string;
  userId?: string;
  ownerType: MediaOwnerType;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  storagePath?: string;
  createdAt: string;
}

export interface MemoryItem {
  id: string;
  ownerId: string;
  userId?: string;
  title: string;
  description: string;
  datePrecision: DatePrecision;
  startDate: string;
  endDate: string | null;
  tags: string[];
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  media: MediaAsset[];
}

export interface LifeChunk {
  id: string;
  ownerId: string;
  userId?: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  media: MediaAsset[];
}

export interface TaskItem {
  id: string;
  ownerId: string;
  userId?: string;
  title: string;
  description: string;
  dueDate: string | null;
  recurrence: TaskRecurrence;
  priority: TaskPriority;
  status: TaskStatus;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface GoogleCalendarSummary {
  id: string;
  summary: string;
  color: string;
  timeZone: string | null;
  primary: boolean;
  selected: boolean;
  accessRole: string | null;
}

export interface GoogleCalendarStatus {
  configured: boolean;
  connected: boolean;
  redirectUri: string;
  calendars: GoogleCalendarSummary[];
  lastSyncedAt: string | null;
}

export interface GoogleCalendarEvent {
  id: string;
  externalId: string;
  calendarId: string;
  calendarSummary: string;
  color: string;
  title: string;
  description: string;
  location: string;
  htmlLink: string | null;
  start: string;
  end: string;
  allDay: boolean;
  recurring: boolean;
  status: string;
}

export interface GoogleCalendarEventResponse {
  events: GoogleCalendarEvent[];
  refreshedAt: string;
}

export interface MemoryPayload {
  title: string;
  description: string;
  datePrecision: DatePrecision;
  startDate: string;
  endDate?: string | null;
  tags?: string[];
  color?: string;
  icon?: string;
}

export interface LifeChunkPayload {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  color?: string;
  icon?: string;
}

export interface TaskPayload {
  title: string;
  description?: string;
  dueDate?: string | null;
  recurrence?: TaskRecurrence;
  priority?: TaskPriority;
  status?: TaskStatus;
  color?: string;
  icon?: string;
  completedAt?: string | null;
}
