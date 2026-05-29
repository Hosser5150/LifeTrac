import type {
  GoogleCalendarEvent,
  GoogleCalendarSummary,
  LifeChunk,
  MediaAsset,
  MediaOwnerType,
  MemoryItem,
  TaskItem
} from "../shared/types";

export type MediaRow = {
  id: string;
  user_id: string;
  owner_id: string;
  owner_type: MediaOwnerType;
  file_name: string;
  original_name: string;
  mime_type: string;
  size: number;
  storage_path: string;
  url: string | null;
  created_at: string;
};

export type MemoryRow = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  date_precision: MemoryItem["datePrecision"];
  start_date: string;
  end_date: string | null;
  tags: string[] | null;
  color: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
};

export type LifeChunkRow = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  color: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  recurrence: TaskItem["recurrence"] | null;
  priority: TaskItem["priority"] | null;
  status: TaskItem["status"] | null;
  color: string | null;
  icon: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GoogleCalendarSelectionRow = {
  calendar_id: string;
  summary: string;
  color: string | null;
  time_zone: string | null;
  is_primary: boolean | null;
  selected: boolean | null;
  access_role: string | null;
};

export type GoogleCalendarEventRow = {
  id: string;
  external_id: string;
  calendar_id: string;
  calendar_summary: string;
  color: string | null;
  title: string;
  description: string | null;
  location: string | null;
  html_link: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean | null;
  recurring: boolean | null;
  status: string | null;
  user_id?: string;
};

export function mapMedia(row: MediaRow, signedUrl?: string): MediaAsset {
  return {
    id: row.id,
    ownerId: row.owner_id,
    userId: row.user_id,
    ownerType: row.owner_type,
    fileName: row.file_name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    url: signedUrl || row.url || row.storage_path,
    storagePath: row.storage_path,
    createdAt: row.created_at
  };
}

export function mapMemory(row: MemoryRow, media: MediaAsset[] = []): MemoryItem {
  return {
    id: row.id,
    ownerId: row.user_id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    datePrecision: row.date_precision,
    startDate: row.start_date,
    endDate: row.end_date,
    tags: row.tags || [],
    color: row.color || "#4777f5",
    icon: row.icon || "book",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    media
  };
}

export function mapLifeChunk(row: LifeChunkRow, media: MediaAsset[] = []): LifeChunk {
  return {
    id: row.id,
    ownerId: row.user_id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    color: row.color || "#4777f5",
    icon: row.icon || "school",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    media
  };
}

export function mapTask(row: TaskRow): TaskItem {
  return {
    id: row.id,
    ownerId: row.user_id,
    userId: row.user_id,
    title: row.title,
    description: row.description || "",
    dueDate: row.due_date,
    recurrence: row.recurrence || "none",
    priority: row.priority || "medium",
    status: row.status || "open",
    color: row.color || "#4777f5",
    icon: row.icon || "calendar",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

export function mapGoogleCalendar(row: GoogleCalendarSelectionRow): GoogleCalendarSummary {
  return {
    id: row.calendar_id,
    summary: row.summary,
    color: row.color || "#6aa4ff",
    timeZone: row.time_zone,
    primary: Boolean(row.is_primary),
    selected: Boolean(row.selected),
    accessRole: row.access_role
  };
}

export function mapGoogleEvent(row: GoogleCalendarEventRow): GoogleCalendarEvent {
  const allDay = Boolean(row.all_day);
  return {
    id: row.id,
    externalId: row.external_id,
    calendarId: row.calendar_id,
    calendarSummary: row.calendar_summary,
    color: row.color || "#6aa4ff",
    title: row.title,
    description: row.description || "",
    location: row.location || "",
    htmlLink: row.html_link,
    start: allDay ? row.start_at.slice(0, 10) : row.start_at,
    end: allDay ? row.end_at.slice(0, 10) : row.end_at,
    allDay,
    recurring: Boolean(row.recurring),
    status: row.status || "confirmed"
  };
}
