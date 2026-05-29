import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import { eq } from "drizzle-orm";
import express from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import type { LifeChunkPayload, MemoryPayload, TaskPayload, TaskPriority, TaskRecurrence, TaskStatus } from "../shared/types";
import { buildMarkdownBackup } from "./backupMarkdown";
import {
  completeGoogleAuthorization,
  createGoogleAuthorizationUrl,
  disconnectGoogleCalendar,
  fetchGoogleCalendarEvents,
  getGoogleCalendarConfig,
  getGoogleCalendarStatus,
  refreshGoogleCalendarList,
  selectGoogleCalendars
} from "./googleCalendar";
import {
  DEFAULT_OWNER_ID,
  MEDIA_DIR,
  createDb,
  getAllLifeChunks,
  getAllMemoryItems,
  getAllTasks,
  lifeChunks,
  mediaAssets,
  memoryItems,
  taskItems,
  type AppDb
} from "./db";

const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, MEDIA_DIR),
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${nanoid()}${extension}`);
    }
  }),
  fileFilter: (_request, file, callback) => {
    callback(null, file.mimetype.startsWith("image/"));
  },
  limits: {
    fileSize: 8 * 1024 * 1024
  }
});

export function createApp(appDb: AppDb = createDb().db) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use("/media", express.static(MEDIA_DIR));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/integrations/google/status", (_request, response) => {
    response.json(getGoogleCalendarStatus(appDb));
  });

  app.get("/api/integrations/google/auth-url", (_request, response) => {
    response.json({ url: createGoogleAuthorizationUrl(appDb) });
  });

  app.get(
    "/api/integrations/google/callback",
    asyncRoute(async (request, response) => {
      const code = stringQuery(request.query.code);
      const state = stringQuery(request.query.state);
      const error = stringQuery(request.query.error);

      if (error) {
        response.redirect(googleRedirect("error", error));
        return;
      }

      if (!code || !state) {
        response.redirect(googleRedirect("error", "missing_code"));
        return;
      }

      try {
        await completeGoogleAuthorization(appDb, code, state);
        response.redirect(googleRedirect("connected"));
      } catch (issue) {
        response.redirect(googleRedirect("error", issue instanceof Error ? issue.message : "callback_failed"));
      }
    })
  );

  app.post(
    "/api/integrations/google/calendars/refresh",
    asyncRoute(async (_request, response) => {
      response.json(await refreshGoogleCalendarList(appDb));
    })
  );

  app.patch("/api/integrations/google/calendars", (request, response) => {
    const selectedIds = Array.isArray(request.body.selectedIds) ? request.body.selectedIds.map(String) : [];
    response.json(selectGoogleCalendars(appDb, selectedIds));
  });

  app.get(
    "/api/integrations/google/events",
    asyncRoute(async (request, response) => {
      response.json(await fetchGoogleCalendarEvents(appDb, stringQuery(request.query.start), stringQuery(request.query.end)));
    })
  );

  app.delete("/api/integrations/google", (_request, response) => {
    disconnectGoogleCalendar(appDb);
    response.status(204).send();
  });

  app.get("/api/backup/markdown", (_request, response) => {
    const exportedAt = new Date().toISOString();
    const markdown = buildMarkdownBackup({
      exportedAt,
      lifeChunks: getAllLifeChunks(appDb),
      memories: getAllMemoryItems(appDb),
      ownerId: DEFAULT_OWNER_ID,
      tasks: getAllTasks(appDb)
    });

    response
      .attachment(`lifetrac-backup-${exportedAt.slice(0, 10)}.md`)
      .type("text/markdown")
      .send(markdown);
  });

  app.get("/api/memories", (_request, response) => {
    response.json(getAllMemoryItems(appDb));
  });

  app.post("/api/memories", (request, response) => {
    const payload = normalizeMemoryPayload(request.body);
    const now = new Date().toISOString();
    const record = {
      id: nanoid(),
      ownerId: DEFAULT_OWNER_ID,
      ...payload,
      createdAt: now,
      updatedAt: now
    };

    appDb.insert(memoryItems).values(record).run();
    response.status(201).json(getAllMemoryItems(appDb).find((memory) => memory.id === record.id));
  });

  app.patch("/api/memories/:id", (request, response) => {
    const existing = appDb.select().from(memoryItems).where(eq(memoryItems.id, request.params.id)).get();
    if (!existing) {
      response.status(404).json({ error: "Memory not found" });
      return;
    }

    const payload = normalizeMemoryPayload({ ...existing, ...request.body });
    appDb
      .update(memoryItems)
      .set({ ...payload, updatedAt: new Date().toISOString() })
      .where(eq(memoryItems.id, request.params.id))
      .run();

    response.json(getAllMemoryItems(appDb).find((memory) => memory.id === request.params.id));
  });

  app.delete("/api/memories/:id", (request, response) => {
    deleteOwnedMediaFiles(appDb, request.params.id);
    appDb.delete(mediaAssets).where(eq(mediaAssets.ownerId, request.params.id)).run();
    appDb.delete(memoryItems).where(eq(memoryItems.id, request.params.id)).run();
    response.status(204).send();
  });

  app.get("/api/life-chunks", (_request, response) => {
    response.json(getAllLifeChunks(appDb));
  });

  app.post("/api/life-chunks", (request, response) => {
    const payload = normalizeLifeChunkPayload(request.body);
    const now = new Date().toISOString();
    const record = {
      id: nanoid(),
      ownerId: DEFAULT_OWNER_ID,
      ...payload,
      createdAt: now,
      updatedAt: now
    };

    appDb.insert(lifeChunks).values(record).run();
    response.status(201).json(getAllLifeChunks(appDb).find((chunk) => chunk.id === record.id));
  });

  app.patch("/api/life-chunks/:id", (request, response) => {
    const existing = appDb.select().from(lifeChunks).where(eq(lifeChunks.id, request.params.id)).get();
    if (!existing) {
      response.status(404).json({ error: "Life chunk not found" });
      return;
    }

    const payload = normalizeLifeChunkPayload({ ...existing, ...request.body });
    appDb
      .update(lifeChunks)
      .set({ ...payload, updatedAt: new Date().toISOString() })
      .where(eq(lifeChunks.id, request.params.id))
      .run();

    response.json(getAllLifeChunks(appDb).find((chunk) => chunk.id === request.params.id));
  });

  app.delete("/api/life-chunks/:id", (request, response) => {
    deleteOwnedMediaFiles(appDb, request.params.id);
    appDb.delete(mediaAssets).where(eq(mediaAssets.ownerId, request.params.id)).run();
    appDb.delete(lifeChunks).where(eq(lifeChunks.id, request.params.id)).run();
    response.status(204).send();
  });

  app.get("/api/tasks", (_request, response) => {
    response.json(getAllTasks(appDb));
  });

  app.post("/api/tasks", (request, response) => {
    const payload = normalizeTaskPayload(request.body);
    const now = new Date().toISOString();
    const record = {
      id: nanoid(),
      ownerId: DEFAULT_OWNER_ID,
      ...payload,
      createdAt: now,
      updatedAt: now
    };

    appDb.insert(taskItems).values(record).run();
    response.status(201).json(getAllTasks(appDb).find((task) => task.id === record.id));
  });

  app.patch("/api/tasks/:id", (request, response) => {
    const existing = appDb.select().from(taskItems).where(eq(taskItems.id, request.params.id)).get();
    if (!existing) {
      response.status(404).json({ error: "Task not found" });
      return;
    }

    const payload = normalizeTaskPayload({ ...existing, ...request.body });
    appDb
      .update(taskItems)
      .set({ ...payload, updatedAt: new Date().toISOString() })
      .where(eq(taskItems.id, request.params.id))
      .run();

    response.json(getAllTasks(appDb).find((task) => task.id === request.params.id));
  });

  app.delete("/api/tasks/:id", (request, response) => {
    appDb.delete(taskItems).where(eq(taskItems.id, request.params.id)).run();
    response.status(204).send();
  });

  app.post("/api/media", upload.single("image"), (request, response) => {
    const file = request.file;
    const ownerType = request.body.ownerType;
    const ownerId = request.body.ownerId;

    if (!file || !ownerId || !["memory", "chunk"].includes(ownerType)) {
      response.status(400).json({ error: "Provide image, ownerId, and ownerType" });
      return;
    }

    const record = {
      id: nanoid(),
      ownerId,
      ownerType,
      fileName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: `/media/${file.filename}`,
      createdAt: new Date().toISOString()
    };

    appDb.insert(mediaAssets).values(record).run();
    response.status(201).json(record);
  });

  app.delete("/api/media/:id", (request, response) => {
    const asset = appDb.select().from(mediaAssets).where(eq(mediaAssets.id, request.params.id)).get();
    if (!asset) {
      response.status(404).json({ error: "Media asset not found" });
      return;
    }

    removeMediaFile(asset.fileName);
    appDb.delete(mediaAssets).where(eq(mediaAssets.id, request.params.id)).run();
    response.status(204).send();
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
    const message = error instanceof Error ? error.message : "Server error";
    response.status(status || 500).json({ error: message });
  });

  return app;
}

function normalizeMemoryPayload(payload: MemoryPayload) {
  return {
    title: required(payload.title, "title"),
    description: String(payload.description || ""),
    datePrecision: payload.datePrecision || "exact",
    startDate: required(payload.startDate, "startDate"),
    endDate: payload.datePrecision === "range" ? required(payload.endDate || "", "endDate") : payload.endDate || null,
    tags: Array.isArray(payload.tags)
      ? payload.tags
      : String(payload.tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
    color: payload.color || "#4777f5",
    icon: payload.icon || "sparkles"
  };
}

function normalizeLifeChunkPayload(payload: LifeChunkPayload) {
  return {
    title: required(payload.title, "title"),
    description: String(payload.description || ""),
    startDate: required(payload.startDate, "startDate"),
    endDate: required(payload.endDate, "endDate"),
    color: payload.color || "#4777f5",
    icon: payload.icon || "calendar-days"
  };
}

function normalizeTaskPayload(payload: TaskPayload) {
  const status = enumValue<TaskStatus>(payload.status, ["open", "done"], "open");
  const completedAt = payload.completedAt || (status === "done" ? new Date().toISOString() : null);

  return {
    title: required(payload.title, "title"),
    description: String(payload.description || ""),
    dueDate: payload.dueDate ? String(payload.dueDate) : null,
    recurrence: enumValue<TaskRecurrence>(payload.recurrence, ["none", "daily", "weekly", "monthly", "yearly"], "none"),
    priority: enumValue<TaskPriority>(payload.priority, ["low", "medium", "high"], "medium"),
    status,
    color: payload.color || "#4777f5",
    icon: payload.icon || "check-circle",
    completedAt
  };
}

function enumValue<T extends string>(value: unknown, allowed: T[], fallback: T) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function required(value: string | null | undefined, field: string) {
  if (!value || !String(value).trim()) {
    throw Object.assign(new Error(`${field} is required`), { status: 400 });
  }

  return String(value).trim();
}

function deleteOwnedMediaFiles(appDb: AppDb, ownerId: string) {
  appDb
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.ownerId, ownerId))
    .all()
    .forEach((asset) => removeMediaFile(asset.fileName));
}

function removeMediaFile(fileName: string) {
  const filePath = path.join(MEDIA_DIR, fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function stringQuery(value: unknown) {
  return typeof value === "string" ? value : "";
}

function googleRedirect(status: "connected" | "error", reason?: string) {
  const redirect = new URL(getGoogleCalendarConfig().appOrigin);
  redirect.searchParams.set("google", status);
  if (reason) {
    redirect.searchParams.set("reason", reason);
  }

  return redirect.toString();
}

function asyncRoute(
  route: (request: express.Request, response: express.Response, next: express.NextFunction) => Promise<void>
) {
  return (request: express.Request, response: express.Response, next: express.NextFunction) => {
    void route(request, response, next).catch(next);
  };
}
