import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { nanoid } from "nanoid";
import type { LifeChunk, MediaAsset, MemoryItem, TaskItem } from "../shared/types";
import {
  googleCalendarConnections,
  googleCalendarEvents,
  googleCalendarSelections,
  googleOauthStates,
  lifeChunks,
  mediaAssets,
  memoryItems,
  taskItems
} from "./schema";

const DEFAULT_OWNER_ID = "local-user";
const DATA_DIR = path.resolve(process.cwd(), "data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");
const DB_PATH = path.join(DATA_DIR, "timeline.sqlite");

export function ensureDataDirs() {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

export function createDb(dbPath = DB_PATH) {
  ensureDataDirs();
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite);
  migrate(sqlite);
  seedIfEmpty(db);
  seedTasksIfEmpty(db);

  return { sqlite, db };
}

export type AppDb = ReturnType<typeof createDb>["db"];

export function migrate(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS memory_items (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      date_precision TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      color TEXT NOT NULL,
      icon TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS life_chunks (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      owner_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_items (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      recurrence TEXT NOT NULL DEFAULT 'none',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      color TEXT NOT NULL DEFAULT '#4777f5',
      icon TEXT NOT NULL DEFAULT 'check-circle',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS google_calendar_connections (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expiry_date TEXT,
      scope TEXT,
      token_type TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS google_calendar_selections (
      calendar_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      color TEXT NOT NULL,
      time_zone TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      selected INTEGER NOT NULL DEFAULT 0,
      access_role TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS google_calendar_events (
      id TEXT PRIMARY KEY,
      calendar_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      html_link TEXT,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      all_day INTEGER NOT NULL DEFAULT 0,
      recurring INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'confirmed',
      source_updated_at TEXT,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS google_oauth_states (
      state TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS google_calendar_events_range_idx
      ON google_calendar_events (calendar_id, start_at, end_at);
  `);
}

export function seedIfEmpty(db: AppDb) {
  const existing = db.select().from(memoryItems).all();
  if (existing.length > 0) {
    return;
  }

  const now = new Date().toISOString();
  const schoolChunkId = nanoid();
  const coopChunkId = nanoid();

  db.insert(lifeChunks)
    .values([
      {
        id: schoolChunkId,
        ownerId: DEFAULT_OWNER_ID,
        title: "Fall Term Reset",
        description:
          "A dense school term with new routines, long study nights, and the start of a more intentional memory bank.",
        startDate: "2025-09-01",
        endDate: "2025-12-20",
        color: "#4777f5",
        icon: "graduation-cap",
        createdAt: now,
        updatedAt: now
      },
      {
        id: coopChunkId,
        ownerId: DEFAULT_OWNER_ID,
        title: "Co-op Season",
        description:
          "A work-focused stretch with weekly milestones, commute rituals, and little moments worth saving before they blur together.",
        startDate: "2026-01-05",
        endDate: "2026-04-30",
        color: "#0f9f87",
        icon: "briefcase",
        createdAt: now,
        updatedAt: now
      }
    ])
    .run();

  db.insert(memoryItems)
    .values([
      {
        id: nanoid(),
        ownerId: DEFAULT_OWNER_ID,
        title: "First week back",
        description:
          "Settled into the new rhythm. The memory to preserve here is less about one class and more about the feeling of turning a page.",
        datePrecision: "exact",
        startDate: "2025-09-08",
        endDate: null,
        tags: ["school", "reset"],
        color: "#4777f5",
        icon: "book-open",
        createdAt: now,
        updatedAt: now
      },
      {
        id: nanoid(),
        ownerId: DEFAULT_OWNER_ID,
        title: "Project crunch month",
        description:
          "A month-level memory for the long stretch when assignments, planning, and late-night notes all collapsed into one chapter.",
        datePrecision: "month",
        startDate: "2025-11-01",
        endDate: null,
        tags: ["projects"],
        color: "#be5ad8",
        icon: "sparkles",
        createdAt: now,
        updatedAt: now
      },
      {
        id: nanoid(),
        ownerId: DEFAULT_OWNER_ID,
        title: "Co-op first milestone",
        description:
          "The first moment where the job stopped feeling abstract and started feeling like a real part of the year.",
        datePrecision: "exact",
        startDate: "2026-02-12",
        endDate: null,
        tags: ["coop", "work"],
        color: "#0f9f87",
        icon: "target",
        createdAt: now,
        updatedAt: now
      }
    ])
    .run();
}

export function seedTasksIfEmpty(db: AppDb) {
  const existing = db.select().from(taskItems).all();
  if (existing.length > 0) {
    return;
  }

  const now = new Date().toISOString();
  db.insert(taskItems)
    .values([
      {
        id: nanoid(),
        ownerId: DEFAULT_OWNER_ID,
        title: "Take out garbage",
        description: "Weekly household reset task.",
        dueDate: null,
        recurrence: "weekly",
        priority: "medium",
        status: "open",
        color: "#57d9df",
        icon: "trash-2",
        createdAt: now,
        updatedAt: now,
        completedAt: null
      },
      {
        id: nanoid(),
        ownerId: DEFAULT_OWNER_ID,
        title: "Sunday room reset",
        description: "Clear desk, laundry, sheets, and planning board.",
        dueDate: null,
        recurrence: "weekly",
        priority: "high",
        status: "open",
        color: "#be5ad8",
        icon: "sparkles",
        createdAt: now,
        updatedAt: now,
        completedAt: null
      },
      {
        id: nanoid(),
        ownerId: DEFAULT_OWNER_ID,
        title: "Add next memory batch",
        description: "Drop in the next few moments before they fade.",
        dueDate: new Date().toISOString().slice(0, 10),
        recurrence: "none",
        priority: "low",
        status: "open",
        color: "#4777f5",
        icon: "calendar-days",
        createdAt: now,
        updatedAt: now,
        completedAt: null
      }
    ])
    .run();
}

export function attachMedia<T extends { id: string }>(records: T[], assets: MediaAsset[]) {
  return records.map((record) => ({
    ...record,
    media: assets.filter((asset) => asset.ownerId === record.id)
  }));
}

export function getAllMemoryItems(db: AppDb): MemoryItem[] {
  const memories = db.select().from(memoryItems).all() as Omit<MemoryItem, "media">[];
  const assets = db.select().from(mediaAssets).where(eq(mediaAssets.ownerType, "memory")).all() as MediaAsset[];
  return attachMedia(memories, assets).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function getAllLifeChunks(db: AppDb): LifeChunk[] {
  const chunks = db.select().from(lifeChunks).all() as Omit<LifeChunk, "media">[];
  const assets = db.select().from(mediaAssets).where(eq(mediaAssets.ownerType, "chunk")).all() as MediaAsset[];
  return attachMedia(chunks, assets).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function getAllTasks(db: AppDb): TaskItem[] {
  return (db.select().from(taskItems).all() as TaskItem[]).sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "open" ? -1 : 1;
    }

    return (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31") || a.createdAt.localeCompare(b.createdAt);
  });
}

export {
  DEFAULT_OWNER_ID,
  googleCalendarConnections,
  googleCalendarEvents,
  googleCalendarSelections,
  googleOauthStates,
  lifeChunks,
  mediaAssets,
  memoryItems,
  taskItems
};
