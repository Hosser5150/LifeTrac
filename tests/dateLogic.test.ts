import { describe, expect, it } from "vitest";
import { chunkMemoryIds, overlapsDateRange } from "../shared/dateLogic";
import type { LifeChunk, MemoryItem } from "../shared/types";

const baseMemory: MemoryItem = {
  id: "memory-1",
  ownerId: "local-user",
  title: "Memory",
  description: "Description",
  datePrecision: "exact",
  startDate: "2026-02-12",
  endDate: null,
  tags: [],
  color: "#4777f5",
  icon: "sparkles",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  media: []
};

const baseChunk: LifeChunk = {
  id: "chunk-1",
  ownerId: "local-user",
  title: "Chunk",
  description: "Description",
  startDate: "2026-01-01",
  endDate: "2026-04-30",
  color: "#0f9f87",
  icon: "briefcase",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  media: []
};

describe("date overlap logic", () => {
  it("matches exact events inside a life chunk", () => {
    expect(overlapsDateRange(baseMemory, baseChunk)).toBe(true);
  });

  it("matches month-level memories when the month intersects the chunk", () => {
    expect(
      overlapsDateRange(
        {
          ...baseMemory,
          datePrecision: "month",
          startDate: "2026-04-01"
        },
        baseChunk
      )
    ).toBe(true);
  });

  it("does not match memories outside the chunk range", () => {
    expect(overlapsDateRange({ ...baseMemory, startDate: "2026-07-01" }, baseChunk)).toBe(false);
  });

  it("builds chunk membership by date overlap", () => {
    const outsideMemory = { ...baseMemory, id: "memory-2", startDate: "2025-12-15" };

    expect(chunkMemoryIds([baseMemory, outsideMemory], [baseChunk])).toEqual({
      "chunk-1": ["memory-1"]
    });
  });
});
