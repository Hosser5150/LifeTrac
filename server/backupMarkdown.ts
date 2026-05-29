import type { LifeChunk, MemoryItem, TaskItem } from "../shared/types";

type MarkdownBackupInput = {
  exportedAt: string;
  lifeChunks: LifeChunk[];
  memories: MemoryItem[];
  ownerId: string;
  tasks: TaskItem[];
};

export function buildMarkdownBackup({ exportedAt, lifeChunks, memories, ownerId, tasks }: MarkdownBackupInput) {
  const payload = {
    format: "lifetrac-markdown-backup",
    version: 1,
    exportedAt,
    ownerId,
    lifeChunks,
    memories,
    tasks
  };

  return [
    "---",
    "lifetrac_backup_version: 1",
    `exported_at: ${JSON.stringify(exportedAt)}`,
    `owner_id: ${JSON.stringify(ownerId)}`,
    'media_folder: "data/media"',
    "---",
    "",
    "# LifeTrac Backup",
    "",
    "This Markdown snapshot keeps a readable copy of the timeline and a machine-readable payload for later import tools.",
    "Copy this file with the `data/media` folder when you want local image files to move with the backup.",
    "",
    "## Summary",
    "",
    `- Exported: ${exportedAt}`,
    `- Life chunks: ${lifeChunks.length}`,
    `- Memories: ${memories.length}`,
    `- Tasks: ${tasks.length}`,
    "",
    "## Life Chunks",
    "",
    ...lifeChunks.flatMap(formatLifeChunk),
    "## Memories",
    "",
    ...memories.flatMap(formatMemory),
    "## Tasks",
    "",
    ...tasks.flatMap(formatTask),
    "## Portable Data Payload",
    "",
    "The JSON block below preserves stable IDs, timestamps, tags, media references, task state, and future import metadata.",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    ""
  ].join("\n");
}

function formatLifeChunk(chunk: LifeChunk) {
  return [
    `### ${heading(chunk.title)}`,
    "",
    `- ID: \`${chunk.id}\``,
    `- Dates: ${chunk.startDate} to ${chunk.endDate}`,
    `- Icon: \`${inline(chunk.icon)}\``,
    `- Color: \`${inline(chunk.color)}\``,
    "",
    blockText(chunk.description),
    ...formatMedia(chunk.media),
    ""
  ];
}

function formatMemory(memory: MemoryItem) {
  return [
    `### ${heading(memory.title)}`,
    "",
    `- ID: \`${memory.id}\``,
    `- Date precision: \`${inline(memory.datePrecision)}\``,
    `- Dates: ${memory.startDate}${memory.endDate ? ` to ${memory.endDate}` : ""}`,
    `- Tags: ${memory.tags.length ? memory.tags.map((tag) => `\`${inline(tag)}\``).join(", ") : "None"}`,
    `- Icon: \`${inline(memory.icon)}\``,
    `- Color: \`${inline(memory.color)}\``,
    "",
    blockText(memory.description),
    ...formatMedia(memory.media),
    ""
  ];
}

function formatTask(task: TaskItem) {
  return [
    `### ${heading(task.title)}`,
    "",
    `- ID: \`${task.id}\``,
    `- Status: \`${inline(task.status)}\``,
    `- Due date: ${task.dueDate || "None"}`,
    `- Recurrence: \`${inline(task.recurrence)}\``,
    `- Priority: \`${inline(task.priority)}\``,
    `- Completed at: ${task.completedAt || "None"}`,
    `- Icon: \`${inline(task.icon)}\``,
    `- Color: \`${inline(task.color)}\``,
    "",
    blockText(task.description),
    ""
  ];
}

function formatMedia(media: { fileName: string; originalName: string; url: string }[]) {
  if (!media.length) {
    return [];
  }

  return [
    "#### Media",
    "",
    ...media.map((asset) => `- ${inline(asset.originalName)}: \`data/media/${inline(asset.fileName)}\` (${inline(asset.url)})`),
    ""
  ];
}

function blockText(value: string) {
  const normalized = value.trim();
  return normalized || "_No description._";
}

function heading(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim() || "Untitled";
}

function inline(value: string) {
  return value.replace(/[\r\n`]+/g, " ").trim();
}
