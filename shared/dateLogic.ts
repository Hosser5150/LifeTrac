import type { LifeChunk, MemoryItem } from "./types";

const MONTH_END_DAY = 28;

export function normalizeRange(input: {
  datePrecision?: string;
  startDate: string;
  endDate?: string | null;
}) {
  const start = parseDateBoundary(input.startDate, "start");
  let end = input.endDate
    ? parseDateBoundary(input.endDate, "end")
    : parseDateBoundary(input.startDate, input.datePrecision === "month" ? "monthEnd" : "end");

  if (end.getTime() < start.getTime()) {
    end = start;
  }

  return { start, end };
}

export function overlapsDateRange(
  item: Pick<MemoryItem, "datePrecision" | "startDate" | "endDate">,
  chunk: Pick<LifeChunk, "startDate" | "endDate">
) {
  const itemRange = normalizeRange(item);
  const chunkRange = normalizeRange({
    datePrecision: "range",
    startDate: chunk.startDate,
    endDate: chunk.endDate
  });

  return itemRange.start.getTime() <= chunkRange.end.getTime() && itemRange.end.getTime() >= chunkRange.start.getTime();
}

export function chunkMemoryIds(memories: MemoryItem[], chunks: LifeChunk[]) {
  return Object.fromEntries(
    chunks.map((chunk) => [chunk.id, memories.filter((memory) => overlapsDateRange(memory, chunk)).map((memory) => memory.id)])
  );
}

export function formatDateLabel(item: Pick<MemoryItem, "datePrecision" | "startDate" | "endDate">) {
  if (item.datePrecision === "month") {
    return monthLabel(item.startDate);
  }

  if (item.datePrecision === "range" && item.endDate) {
    return `${readableDate(item.startDate)} - ${readableDate(item.endDate)}`;
  }

  return readableDate(item.startDate);
}

export function readableDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(parseDateBoundary(value, "start"));
}

export function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(parseDateBoundary(value, "start"));
}

function parseDateBoundary(value: string, boundary: "start" | "end" | "monthEnd") {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month) {
    return new Date(value);
  }

  if (boundary === "monthEnd") {
    return new Date(Date.UTC(year, month, 0));
  }

  return new Date(Date.UTC(year, month - 1, day || (boundary === "end" ? MONTH_END_DAY : 1)));
}
