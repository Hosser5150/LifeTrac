import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { createDb } from "../server/db";

describe("timeline API", () => {
  let cleanupPath: string;
  let sqlite: ReturnType<typeof createDb>["sqlite"];
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    cleanupPath = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-test-"));
    const created = createDb(path.join(cleanupPath, "test.sqlite"));
    sqlite = created.sqlite;
    app = createApp(created.db);
  });

  afterEach(() => {
    sqlite.close();
    fs.rmSync(cleanupPath, { recursive: true, force: true });
  });

  it("creates, updates, and deletes a memory", async () => {
    const created = await request(app)
      .post("/api/memories")
      .send({
        title: "A new memory",
        description: "A useful detail",
        datePrecision: "exact",
        startDate: "2026-05-19",
        tags: ["test"],
        color: "#4777f5",
        icon: "star"
      })
      .expect(201);

    expect(created.body.id).toBeTruthy();
    expect(created.body.ownerId).toBe("local-user");

    const updated = await request(app).patch(`/api/memories/${created.body.id}`).send({ title: "Updated memory" }).expect(200);
    expect(updated.body.title).toBe("Updated memory");

    await request(app).delete(`/api/memories/${created.body.id}`).expect(204);
    const memories = await request(app).get("/api/memories").expect(200);
    expect(memories.body.some((memory: { id: string }) => memory.id === created.body.id)).toBe(false);
  });

  it("creates a life chunk", async () => {
    const created = await request(app)
      .post("/api/life-chunks")
      .send({
        title: "Summer chapter",
        description: "A multi-month stretch",
        startDate: "2026-06-01",
        endDate: "2026-08-31",
        color: "#e07a35",
        icon: "heart"
      })
      .expect(201);

    expect(created.body.title).toBe("Summer chapter");
  });

  it("uploads image metadata without storing image blobs in records", async () => {
    const memories = await request(app).get("/api/memories").expect(200);
    const ownerId = memories.body[0].id;

    const uploaded = await request(app)
      .post("/api/media")
      .field("ownerId", ownerId)
      .field("ownerType", "memory")
      .attach("image", Buffer.from("fake image bytes"), {
        filename: "memory.png",
        contentType: "image/png"
      })
      .expect(201);

    expect(uploaded.body.url).toMatch(/^\/media\//);
    expect(uploaded.body).not.toHaveProperty("data");

    const refreshed = await request(app).get("/api/memories").expect(200);
    const memory = refreshed.body.find((item: { id: string }) => item.id === ownerId);
    expect(memory.media[0].originalName).toBe("memory.png");

    await request(app).delete(`/api/media/${uploaded.body.id}`).expect(204);
  });

  it("creates, completes, and deletes a task", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .send({
        title: "Take bins out",
        description: "Recurring household task",
        dueDate: "2026-05-22",
        recurrence: "weekly",
        priority: "high",
        color: "#57d9df",
        icon: "trash-2"
      })
      .expect(201);

    expect(created.body.id).toBeTruthy();
    expect(created.body.status).toBe("open");
    expect(created.body.recurrence).toBe("weekly");

    const completed = await request(app).patch(`/api/tasks/${created.body.id}`).send({ status: "done" }).expect(200);
    expect(completed.body.status).toBe("done");
    expect(completed.body.completedAt).toBeTruthy();

    const rolledForward = await request(app)
      .patch(`/api/tasks/${created.body.id}`)
      .send({ status: "open", dueDate: "2026-05-29", completedAt: "2026-05-22T10:00:00.000Z" })
      .expect(200);
    expect(rolledForward.body.status).toBe("open");
    expect(rolledForward.body.dueDate).toBe("2026-05-29");
    expect(rolledForward.body.completedAt).toBe("2026-05-22T10:00:00.000Z");

    await request(app).delete(`/api/tasks/${created.body.id}`).expect(204);
    const tasks = await request(app).get("/api/tasks").expect(200);
    expect(tasks.body.some((task: { id: string }) => task.id === created.body.id)).toBe(false);
  });

  it("exports a portable Markdown backup", async () => {
    const backup = await request(app).get("/api/backup/markdown").expect(200);

    expect(backup.headers["content-type"]).toContain("text/markdown");
    expect(backup.headers["content-disposition"]).toContain("lifetrac-backup-");
    expect(backup.text).toContain("# LifeTrac Backup");
    expect(backup.text).toContain('"format": "lifetrac-markdown-backup"');
    expect(backup.text).toContain("## Life Chunks");
    expect(backup.text).toContain("## Memories");
    expect(backup.text).toContain("## Tasks");
  });

  it("reports Google Calendar setup state without exposing tokens", async () => {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

    const status = await request(app).get("/api/integrations/google/status").expect(200);
    expect(status.body.configured).toBe(false);
    expect(status.body.connected).toBe(false);
    expect(status.body.redirectUri).toContain("/api/integrations/google/callback");
    expect(status.body).not.toHaveProperty("accessToken");
    expect(status.body).not.toHaveProperty("refreshToken");

    if (clientId) {
      process.env.GOOGLE_CALENDAR_CLIENT_ID = clientId;
    }
    if (clientSecret) {
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET = clientSecret;
    }
  });
});
