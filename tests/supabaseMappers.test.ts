import { describe, expect, it } from "vitest";
import { mapGoogleEvent, mapLifeChunk, mapMedia, mapMemory, mapTask } from "../src/supabaseMappers";

describe("Supabase mappers", () => {
  it("maps memory rows into existing UI memory items", () => {
    const memory = mapMemory(
      {
        color: null,
        created_at: "2026-01-01T00:00:00.000Z",
        date_precision: "exact",
        description: "A useful day",
        end_date: null,
        icon: null,
        id: "memory-1",
        start_date: "2026-01-03",
        tags: ["school", "focus"],
        title: "First week",
        updated_at: "2026-01-02T00:00:00.000Z",
        user_id: "user-1"
      },
      []
    );

    expect(memory.ownerId).toBe("user-1");
    expect(memory.userId).toBe("user-1");
    expect(memory.color).toBe("#4777f5");
    expect(memory.icon).toBe("book");
    expect(memory.tags).toEqual(["school", "focus"]);
  });

  it("maps life chunks, media, and tasks with camelCase fields", () => {
    const media = mapMedia(
      {
        created_at: "2026-01-01T00:00:00.000Z",
        file_name: "asset.png",
        id: "media-1",
        mime_type: "image/png",
        original_name: "Asset.png",
        owner_id: "chunk-1",
        owner_type: "chunk",
        size: 120,
        storage_path: "user-1/asset.png",
        url: null,
        user_id: "user-1"
      },
      "https://signed.example/asset.png"
    );
    const chunk = mapLifeChunk(
      {
        color: "#0f9f87",
        created_at: "2026-01-01T00:00:00.000Z",
        description: "Big season",
        end_date: "2026-04-30",
        icon: "briefcase",
        id: "chunk-1",
        start_date: "2026-01-01",
        title: "Co-op",
        updated_at: "2026-01-02T00:00:00.000Z",
        user_id: "user-1"
      },
      [media]
    );
    const task = mapTask({
      color: null,
      completed_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      description: null,
      due_date: null,
      icon: null,
      id: "task-1",
      priority: null,
      recurrence: null,
      status: null,
      title: "Review notes",
      updated_at: "2026-01-02T00:00:00.000Z",
      user_id: "user-1"
    });

    expect(chunk.media[0].url).toBe("https://signed.example/asset.png");
    expect(chunk.ownerId).toBe("user-1");
    expect(task.description).toBe("");
    expect(task.recurrence).toBe("none");
    expect(task.priority).toBe("medium");
  });

  it("keeps all-day Google events as date-only ranges for calendar cell matching", () => {
    const event = mapGoogleEvent({
      all_day: true,
      calendar_id: "primary",
      calendar_summary: "Personal",
      color: "#d34f68",
      description: null,
      end_at: "2026-05-23T00:00:00.000Z",
      external_id: "google-event",
      html_link: null,
      id: "primary:google-event",
      location: null,
      recurring: false,
      start_at: "2026-05-22T00:00:00.000Z",
      status: "confirmed",
      title: "Softball",
      user_id: "user-1"
    });

    expect(event.start).toBe("2026-05-22");
    expect(event.end).toBe("2026-05-23");
    expect(event.allDay).toBe(true);
  });
});
