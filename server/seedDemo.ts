import { createDb, DEFAULT_OWNER_ID } from "./db";

const { sqlite } = createDb();
const now = new Date().toISOString();

const chunkSeeds = [
  ["demo-chunk-2018-winter", "Grade 11 Winter Push", "A school-heavy season of exams, routines, and figuring out which subjects actually felt alive.", "2018-01-08", "2018-04-27", "#4777f5", "book-open"],
  ["demo-chunk-2018-summer", "Summer Reset", "A looser stretch with family plans, small adventures, and the feeling of having real time again.", "2018-06-01", "2018-08-31", "#e07a35", "sparkles"],
  ["demo-chunk-2019-spring", "Club Project Season", "A hands-on run of meetings, deadlines, and learning how group work feels when everyone cares.", "2019-02-04", "2019-05-24", "#0f9f87", "target"],
  ["demo-chunk-2019-fall", "Application Fall", "A term shaped by applications, essays, comparison, and the strange pressure of choosing a future.", "2019-09-03", "2019-12-20", "#be5ad8", "star"],
  ["demo-chunk-2020-remote", "Remote School Pivot", "The year turned inward: online classes, changed routines, and memories that mostly happened at home.", "2020-03-16", "2020-06-26", "#d34f68", "calendar-days"],
  ["demo-chunk-2020-build", "At-Home Build Phase", "A quieter chunk for learning tools, making small projects, and keeping momentum without much structure.", "2020-07-01", "2020-11-30", "#2f6f5e", "sparkles"],
  ["demo-chunk-2021-return", "Return To Campus Energy", "A re-entry season where ordinary hallway moments and in-person conversations felt weirdly important.", "2021-02-01", "2021-06-18", "#4777f5", "map-pin"],
  ["demo-chunk-2021-side-project", "Portfolio Prototype", "A long experiment in turning rough ideas into something visible enough to show another person.", "2021-08-01", "2021-12-15", "#0f9f87", "target"],
  ["demo-chunk-2022-transition", "University Transition", "The months around moving into a new academic rhythm, with a lot of firsts compressed together.", "2022-01-10", "2022-04-29", "#be5ad8", "graduation-cap"],
  ["demo-chunk-2022-fall", "First Big Fall Term", "A dense first-year term of labs, late nights, new friends, and learning what pace was sustainable.", "2022-09-01", "2022-12-21", "#4777f5", "book-open"],
  ["demo-chunk-2023-coop", "First Co-op Hunt", "Applications, interviews, uncertainty, and the first signs that work life could become real.", "2023-01-09", "2023-04-28", "#0f9f87", "briefcase"],
  ["demo-chunk-2023-summer", "Summer Work Term", "A practical season with standups, code reviews, commute rituals, and a new kind of tired.", "2023-05-01", "2023-08-25", "#2f6f5e", "briefcase"],
  ["demo-chunk-2024-winter", "Heavy Course Load", "A technically demanding run where assignments stacked up and the calendar started to matter.", "2024-01-08", "2024-04-24", "#d34f68", "book-open"],
  ["demo-chunk-2024-fall", "Productive Fall", "A more confident stretch of building, studying, and keeping better notes about what happened.", "2024-09-03", "2024-12-18", "#e07a35", "sparkles"],
  ["demo-chunk-2025-winter", "Interview Loop", "A focused period of preparation, calls, follow-ups, and trying to stay grounded through it all.", "2025-01-06", "2025-04-25", "#0f9f87", "target"],
  ["demo-chunk-2025-fall", "Fall Term Reset", "A dense school term with new routines, long study nights, and the start of a more intentional memory bank.", "2025-09-01", "2025-12-20", "#4777f5", "graduation-cap"],
  ["demo-chunk-2026-coop", "Co-op Season", "A work-focused stretch with weekly milestones, commute rituals, and little moments worth saving before they blur together.", "2026-01-05", "2026-05-19", "#0f9f87", "briefcase"]
] as const;

const memoryTemplates = [
  ["first-week", "First week rhythm", "The first few days set the tone: new routines, a few awkward starts, and one moment that made the season feel real.", 7, "exact", "reset"],
  ["middle", "Midpoint checkpoint", "A memory from the middle of the chunk, when the work felt familiar and the patterns were easier to notice.", 48, "exact", "checkpoint"],
  ["photo", "Small scene worth saving", "Not a huge milestone, just a vivid little scene that would probably disappear if it did not get written down.", 77, "exact", "scene"],
  ["wrap", "Closing reflection", "The end of the chapter had its own texture: what changed, what stuck, and what felt unfinished.", 104, "month", "reflection"]
] as const;

const taskSeeds = [
  ["demo-task-2026-05-20-notes", "Review week notes", "Sweep course, work, and memory notes into one list.", "2026-05-20", "none", "medium", "done", "#4777f5", "book-open"],
  ["demo-task-2026-05-22-laundry", "Fold laundry", "Clear the laundry pile before the weekend.", "2026-05-22", "none", "low", "open", "#57d9df", "sparkles"],
  ["demo-task-2026-05-22-call", "Call dentist", "Book the next cleaning appointment.", "2026-05-22", "none", "medium", "open", "#be5ad8", "calendar-days"],
  ["demo-task-2026-05-22-groceries", "Restock groceries", "Fruit, breakfast, and study snacks.", "2026-05-22", "none", "medium", "open", "#0f9f87", "briefcase"],
  ["demo-task-2026-05-22-camera", "Save weekend photos", "Pick a few photos for the memory bank.", "2026-05-22", "none", "low", "open", "#e07a35", "camera"],
  ["demo-task-2026-05-26-invoice", "Submit work receipt", "File the transit and lunch receipt.", "2026-05-26", "none", "medium", "open", "#2f6f5e", "briefcase"],
  ["demo-task-2026-05-26-reading", "Read chapter outline", "Prepare questions before the session.", "2026-05-26", "none", "high", "open", "#d34f68", "book-open"],
  ["demo-task-2026-05-26-reset", "Desk reset", "Put the space back in working order.", "2026-05-26", "weekly", "low", "open", "#57d9df", "sparkles"],
  ["demo-task-2026-05-29-planning", "Plan June priorities", "Turn loose ideas into three focus lanes.", "2026-05-29", "none", "high", "open", "#be5ad8", "target"],
  ["demo-task-2026-05-29-backup", "Check LifeTrac backup", "Export the latest Markdown copy.", "2026-05-29", "monthly", "medium", "open", "#4777f5", "calendar-days"],
  ["demo-task-2026-05-29-room", "Room reset checklist", "Tidy, sheets, recycling, and supplies.", "2026-05-29", "weekly", "medium", "done", "#57d9df", "sparkles"],
  ["demo-task-2026-05-29-photos", "Tag photo memories", "Tag scenes that belong in the timeline.", "2026-05-29", "none", "low", "open", "#e07a35", "camera"],
  ["demo-task-2026-05-29-friends", "Reply to weekend plans", "Confirm timing and the meetup spot.", "2026-05-29", "none", "medium", "open", "#0f9f87", "map-pin"]
] as const;

const insertChunk = sqlite.prepare(`
  INSERT OR IGNORE INTO life_chunks (
    id, owner_id, title, description, start_date, end_date, color, icon, created_at, updated_at
  ) VALUES (
    @id, @ownerId, @title, @description, @startDate, @endDate, @color, @icon, @createdAt, @updatedAt
  )
`);

const insertMemory = sqlite.prepare(`
  INSERT OR IGNORE INTO memory_items (
    id, owner_id, title, description, date_precision, start_date, end_date, tags, color, icon, created_at, updated_at
  ) VALUES (
    @id, @ownerId, @title, @description, @datePrecision, @startDate, @endDate, @tags, @color, @icon, @createdAt, @updatedAt
  )
`);

const insertTask = sqlite.prepare(`
  INSERT OR IGNORE INTO task_items (
    id, owner_id, title, description, due_date, recurrence, priority, status, color, icon, created_at, updated_at, completed_at
  ) VALUES (
    @id, @ownerId, @title, @description, @dueDate, @recurrence, @priority, @status, @color, @icon, @createdAt, @updatedAt, @completedAt
  )
`);

const existingChunkTitles = new Set(
  sqlite.prepare("SELECT title FROM life_chunks WHERE owner_id = ?").all(DEFAULT_OWNER_ID).map((row) => (row as { title: string }).title)
);

for (const [id, title, description, startDate, endDate, color, icon] of chunkSeeds) {
  if (!existingChunkTitles.has(title)) {
    insertChunk.run({
      id,
      ownerId: DEFAULT_OWNER_ID,
      title,
      description,
      startDate,
      endDate,
      color,
      icon,
      createdAt: now,
      updatedAt: now
    });
  }

  for (const [suffix, memoryTitle, memoryDescription, offset, precision, tag] of memoryTemplates) {
    const memoryDate = addDays(startDate, offset);
    if (memoryDate > endDate || memoryDate > "2026-05-19") {
      continue;
    }

    insertMemory.run({
      id: `${id}-${suffix}`,
      ownerId: DEFAULT_OWNER_ID,
      title: `${memoryTitle}: ${title}`,
      description: memoryDescription,
      datePrecision: precision,
      startDate: precision === "month" ? `${memoryDate.slice(0, 7)}-01` : memoryDate,
      endDate: null,
      tags: JSON.stringify(["demo", tag, title.toLowerCase().replaceAll(" ", "-")]),
      color,
      icon: suffix === "photo" ? "camera" : icon,
      createdAt: now,
      updatedAt: now
    });
  }
}

for (const [id, title, description, dueDate, recurrence, priority, status, color, icon] of taskSeeds) {
  insertTask.run({
    id,
    ownerId: DEFAULT_OWNER_ID,
    title,
    description,
    dueDate,
    recurrence,
    priority,
    status,
    color,
    icon,
    createdAt: now,
    updatedAt: now,
    completedAt: status === "done" ? now : null
  });
}

sqlite.close();
console.log(`Seeded ${chunkSeeds.length} demo chunks and ${taskSeeds.length} current-month task samples.`);

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
