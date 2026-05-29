import type {
  GoogleCalendarEventResponse,
  GoogleCalendarStatus,
  GoogleCalendarSummary,
  LifeChunk,
  LifeChunkPayload,
  MediaAsset,
  MediaOwnerType,
  MemoryItem,
  MemoryPayload,
  TaskItem,
  TaskPayload
} from "../shared/types";
import { buildClientMarkdownBackup } from "./backupMarkdown";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import {
  mapGoogleCalendar,
  mapGoogleEvent,
  mapLifeChunk,
  mapMedia,
  mapMemory,
  mapTask,
  type GoogleCalendarEventRow,
  type GoogleCalendarSelectionRow,
  type LifeChunkRow,
  type MediaRow,
  type MemoryRow,
  type TaskRow
} from "./supabaseMappers";

const mediaBucket = "media";

export async function getMemories() {
  if (!isSupabaseConfigured) {
    return request<MemoryItem[]>("/api/memories");
  }

  const { data, error } = await supabase.from("memory_items").select("*").order("start_date", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data || []) as MemoryRow[];
  const media = await getMediaForOwners(rows.map((row) => row.id), "memory");
  return rows.map((row) => mapMemory(row, media.get(row.id) || []));
}

export async function saveMemory(payload: MemoryPayload, id?: string) {
  if (!isSupabaseConfigured) {
    return request<MemoryItem>(id ? `/api/memories/${id}` : "/api/memories", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  const userId = await getCurrentUserId();
  const row = {
    color: payload.color || "#4777f5",
    date_precision: payload.datePrecision,
    description: payload.description,
    end_date: payload.endDate || null,
    icon: payload.icon || "book",
    start_date: payload.startDate,
    tags: payload.tags || [],
    title: payload.title,
    updated_at: new Date().toISOString(),
    user_id: userId
  };

  const query = id
    ? supabase.from("memory_items").update(row).eq("id", id).select("*").single()
    : supabase.from("memory_items").insert(row).select("*").single();
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return mapMemory(data as MemoryRow, []);
}

export async function deleteMemory(id: string) {
  if (!isSupabaseConfigured) {
    await request<void>(`/api/memories/${id}`, { method: "DELETE" });
    return;
  }

  const { error } = await supabase.from("memory_items").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function getLifeChunks() {
  if (!isSupabaseConfigured) {
    return request<LifeChunk[]>("/api/life-chunks");
  }

  const { data, error } = await supabase.from("life_chunks").select("*").order("start_date", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data || []) as LifeChunkRow[];
  const media = await getMediaForOwners(rows.map((row) => row.id), "chunk");
  return rows.map((row) => mapLifeChunk(row, media.get(row.id) || []));
}

export async function saveLifeChunk(payload: LifeChunkPayload, id?: string) {
  if (!isSupabaseConfigured) {
    return request<LifeChunk>(id ? `/api/life-chunks/${id}` : "/api/life-chunks", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  const userId = await getCurrentUserId();
  const row = {
    color: payload.color || "#4777f5",
    description: payload.description,
    end_date: payload.endDate,
    icon: payload.icon || "school",
    start_date: payload.startDate,
    title: payload.title,
    updated_at: new Date().toISOString(),
    user_id: userId
  };

  const query = id
    ? supabase.from("life_chunks").update(row).eq("id", id).select("*").single()
    : supabase.from("life_chunks").insert(row).select("*").single();
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return mapLifeChunk(data as LifeChunkRow, []);
}

export async function deleteLifeChunk(id: string) {
  if (!isSupabaseConfigured) {
    await request<void>(`/api/life-chunks/${id}`, { method: "DELETE" });
    return;
  }

  const { error } = await supabase.from("life_chunks").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function getTasks() {
  if (!isSupabaseConfigured) {
    return request<TaskItem[]>("/api/tasks");
  }

  const { data, error } = await supabase.from("task_items").select("*").order("due_date", { ascending: true, nullsFirst: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data || []) as TaskRow[]).map(mapTask);
}

export async function saveTask(payload: TaskPayload, id?: string) {
  if (!isSupabaseConfigured) {
    return request<TaskItem>(id ? `/api/tasks/${id}` : "/api/tasks", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  const userId = await getCurrentUserId();
  const row = {
    color: payload.color || "#4777f5",
    completed_at: payload.completedAt || null,
    description: payload.description || "",
    due_date: payload.dueDate || null,
    icon: payload.icon || "calendar",
    priority: payload.priority || "medium",
    recurrence: payload.recurrence || "none",
    status: payload.status || "open",
    title: payload.title,
    updated_at: new Date().toISOString(),
    user_id: userId
  };

  const query = id
    ? supabase.from("task_items").update(row).eq("id", id).select("*").single()
    : supabase.from("task_items").insert(row).select("*").single();
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return mapTask(data as TaskRow);
}

export async function deleteTask(id: string) {
  if (!isSupabaseConfigured) {
    await request<void>(`/api/tasks/${id}`, { method: "DELETE" });
    return;
  }

  const { error } = await supabase.from("task_items").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function getGoogleCalendarStatus() {
  if (!isSupabaseConfigured) {
    return request<GoogleCalendarStatus>("/api/integrations/google/status");
  }

  return invokeFunction<GoogleCalendarStatus>("calendar-status");
}

export async function getGoogleCalendarAuthUrl() {
  if (!isSupabaseConfigured) {
    return request<{ url: string }>("/api/integrations/google/auth-url");
  }

  return invokeFunction<{ url: string }>("calendar-auth-url");
}

export async function refreshGoogleCalendars() {
  if (!isSupabaseConfigured) {
    return request<GoogleCalendarSummary[]>("/api/integrations/google/calendars/refresh", { method: "POST" });
  }

  return invokeFunction<GoogleCalendarSummary[]>("calendar-refresh-calendars");
}

export async function selectGoogleCalendars(selectedIds: string[]) {
  if (!isSupabaseConfigured) {
    return request<GoogleCalendarSummary[]>("/api/integrations/google/calendars", {
      body: JSON.stringify({ selectedIds }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
  }

  const userId = await getCurrentUserId();
  const { data: existing, error: fetchError } = await supabase.from("google_calendar_selections").select("*").eq("user_id", userId);
  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const selectedSet = new Set(selectedIds);
  await Promise.all(
    ((existing || []) as GoogleCalendarSelectionRow[]).map(async (calendar) => {
      const { error } = await supabase
        .from("google_calendar_selections")
        .update({ selected: selectedSet.has(calendar.calendar_id), updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("calendar_id", calendar.calendar_id);
      if (error) {
        throw new Error(error.message);
      }
    })
  );

  const { data, error } = await supabase.from("google_calendar_selections").select("*").eq("user_id", userId).order("is_primary", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data || []) as GoogleCalendarSelectionRow[]).map(mapGoogleCalendar);
}

export async function getGoogleCalendarEvents(start: string, end: string) {
  if (!isSupabaseConfigured) {
    const query = new URLSearchParams({ start, end });
    return request<GoogleCalendarEventResponse>(`/api/integrations/google/events?${query}`);
  }

  return invokeFunction<GoogleCalendarEventResponse>("calendar-refresh-range", { end, start });
}

export async function disconnectGoogleCalendar() {
  if (!isSupabaseConfigured) {
    await request<void>("/api/integrations/google", { method: "DELETE" });
    return;
  }

  await invokeFunction<void>("calendar-disconnect");
}

export async function downloadMarkdownBackup() {
  if (!isSupabaseConfigured) {
    const response = await fetch("/api/backup/markdown");
    if (!response.ok) {
      throw new Error("Could not export Markdown backup");
    }
    await downloadResponseBlob(response);
    return;
  }

  const [lifeChunks, memories, tasks, userId] = await Promise.all([getLifeChunks(), getMemories(), getTasks(), getCurrentUserId()]);
  const exportedAt = new Date().toISOString();
  const markdown = buildClientMarkdownBackup({ exportedAt, lifeChunks, memories, tasks, userId });
  const backupUrl = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  downloadBlobUrl(backupUrl, `lifetrac-backup-${exportedAt.slice(0, 10)}.md`);
}

export async function uploadImage(ownerId: string, ownerType: MediaOwnerType, file: File) {
  if (!isSupabaseConfigured) {
    const form = new FormData();
    form.append("ownerId", ownerId);
    form.append("ownerType", ownerType);
    form.append("image", file);

    return request<MediaAsset>("/api/media", {
      method: "POST",
      body: form
    });
  }

  const userId = await getCurrentUserId();
  const assetId = crypto.randomUUID();
  const fileName = `${assetId}-${sanitizeFilename(file.name)}`;
  const storagePath = `${userId}/${fileName}`;
  const { error: uploadError } = await supabase.storage.from(mediaBucket).upload(storagePath, file, {
    contentType: file.type,
    upsert: false
  });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const row = {
    file_name: fileName,
    id: assetId,
    mime_type: file.type || "application/octet-stream",
    original_name: file.name,
    owner_id: ownerId,
    owner_type: ownerType,
    size: file.size,
    storage_path: storagePath,
    url: storagePath,
    user_id: userId
  };

  const { data, error } = await supabase.from("media_assets").insert(row).select("*").single();
  if (error) {
    await supabase.storage.from(mediaBucket).remove([storagePath]);
    throw new Error(error.message);
  }

  const signedUrl = await getSignedMediaUrl(storagePath);
  return mapMedia(data as MediaRow, signedUrl);
}

export async function deleteMedia(id: string) {
  if (!isSupabaseConfigured) {
    await request<void>(`/api/media/${id}`, { method: "DELETE" });
    return;
  }

  const { data, error: fetchError } = await supabase.from("media_assets").select("*").eq("id", id).single();
  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const row = data as MediaRow;
  const { error } = await supabase.from("media_assets").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  await supabase.storage.from(mediaBucket).remove([row.storage_path]);
}

async function getMediaForOwners(ownerIds: string[], ownerType: MediaOwnerType) {
  const grouped = new Map<string, MediaAsset[]>();
  if (!ownerIds.length) {
    return grouped;
  }

  const { data, error } = await supabase.from("media_assets").select("*").eq("owner_type", ownerType).in("owner_id", ownerIds).order("created_at");
  if (error) {
    throw new Error(error.message);
  }

  await Promise.all(
    ((data || []) as MediaRow[]).map(async (row) => {
      const media = mapMedia(row, await getSignedMediaUrl(row.storage_path));
      grouped.set(row.owner_id, [...(grouped.get(row.owner_id) || []), media]);
    })
  );

  return grouped;
}

async function getSignedMediaUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from(mediaBucket).createSignedUrl(storagePath, 60 * 60);
  if (error) {
    return storagePath;
  }
  return data.signedUrl;
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error(error?.message || "You need to sign in first");
  }
  return data.user.id;
}

async function invokeFunction<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, body ? { body } : undefined);
  if (error) {
    throw new Error(await getFunctionErrorMessage(name, error));
  }
  return data as T;
}

async function getFunctionErrorMessage(name: string, error: unknown) {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    const payload = await context.clone().json().catch(async () => ({ error: await context.clone().text().catch(() => "") }));
    if (payload && typeof payload === "object") {
      const detail = "error" in payload ? payload.error : "message" in payload ? payload.message : JSON.stringify(payload);
      if (detail) {
        return `${name}: ${detail}`;
      }
    }
  }

  return `${name}: ${error instanceof Error ? error.message : "Edge Function request failed"}`;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(detail.error || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function downloadResponseBlob(response: Response) {
  const disposition = response.headers.get("content-disposition") || "";
  const fileName = disposition.match(/filename="?([^";]+)"?/)?.[1] || "lifetrac-backup.md";
  const backupUrl = URL.createObjectURL(await response.blob());
  downloadBlobUrl(backupUrl, fileName);
}

function downloadBlobUrl(backupUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.href = backupUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(backupUrl), 0);
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "upload";
}
