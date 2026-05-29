import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Download,
  Flag,
  Images,
  Layers3,
  Library,
  ListPlus,
  LogOut,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2,
  X
} from "lucide-react";
import type {
  DatePrecision,
  GoogleCalendarEvent,
  GoogleCalendarStatus,
  GoogleCalendarSummary,
  LifeChunk,
  LifeChunkPayload,
  MediaAsset,
  MemoryItem,
  MemoryPayload,
  TaskItem,
  TaskPayload,
  TaskPriority,
  TaskRecurrence
} from "../shared/types";
import { formatDateLabel, monthLabel, overlapsDateRange, readableDate } from "../shared/dateLogic";
import {
  deleteLifeChunk,
  deleteMedia,
  deleteMemory,
  deleteTask,
  disconnectGoogleCalendar,
  downloadMarkdownBackup,
  getGoogleCalendarAuthUrl,
  getGoogleCalendarEvents,
  getGoogleCalendarStatus,
  getTasks,
  refreshGoogleCalendars,
  saveLifeChunk,
  saveMemory,
  saveTask,
  selectGoogleCalendars,
  uploadImage
} from "./api";
import { useAuth } from "./auth";
import { iconOptions, TimelineIcon } from "./iconMap";
import { useTimelineData } from "./useTimelineData";

type ViewMode = "timeline" | "diary";
type CalendarFilters = {
  years: string[];
  months: string[];
  chunkId: string;
};
type EditorState =
  | { type: "memory"; mode: "create"; item?: undefined }
  | { type: "memory"; mode: "edit"; item: MemoryItem }
  | { type: "chunk"; mode: "create"; item?: undefined }
  | { type: "chunk"; mode: "edit"; item: LifeChunk };

const viewConfig = [
  { id: "timeline" as const, label: "Timeline", icon: Layers3 },
  { id: "diary" as const, label: "Diary", icon: Library }
];

const colorOptions = ["#4777f5", "#0f9f87", "#be5ad8", "#e07a35", "#2f6f5e", "#d34f68"];

type SurfaceMoveFrame = {
  frame: number;
  tilt: boolean;
  x: number;
  y: number;
};

const surfaceMoveFrames = new WeakMap<HTMLElement, SurfaceMoveFrame>();

function queueSurfaceMove(event: PointerEvent<HTMLElement>, tilt: boolean) {
  const surface = event.currentTarget;
  const pending = surfaceMoveFrames.get(surface);

  if (pending) {
    pending.tilt = tilt;
    pending.x = event.clientX;
    pending.y = event.clientY;
    return;
  }

  const move = {
    frame: 0,
    tilt,
    x: event.clientX,
    y: event.clientY
  };

  move.frame = window.requestAnimationFrame(() => {
    const rect = surface.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (move.x - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (move.y - rect.top) / rect.height));
    surface.style.setProperty("--mx", `${x * 100}%`);
    surface.style.setProperty("--my", `${y * 100}%`);

    if (move.tilt) {
      surface.style.setProperty("--tilt-x", `${(0.5 - y) * 2.4}deg`);
      surface.style.setProperty("--tilt-y", `${(x - 0.5) * 3}deg`);
    }

    surfaceMoveFrames.delete(surface);
  });

  surfaceMoveFrames.set(surface, move);
}

function handleReactiveMove(event: PointerEvent<HTMLElement>) {
  queueSurfaceMove(event, true);
}

function resetReactiveMove(event: PointerEvent<HTMLElement>) {
  const pending = surfaceMoveFrames.get(event.currentTarget);
  if (pending) {
    window.cancelAnimationFrame(pending.frame);
    surfaceMoveFrames.delete(event.currentTarget);
  }

  event.currentTarget.style.setProperty("--tilt-x", "0deg");
  event.currentTarget.style.setProperty("--tilt-y", "0deg");
}

function handleGlowMove(event: PointerEvent<HTMLElement>) {
  queueSurfaceMove(event, false);
}

export function App() {
  const { isHostedMode, signOut, user } = useAuth();
  const { memories, chunks, chunkMap, loading, error, refresh } = useTimelineData();
  const [view, setView] = useState<ViewMode>("timeline");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  async function refreshTasks() {
    try {
      setTaskError(null);
      setTasks(await getTasks());
    } catch (issue) {
      setTaskError(issue instanceof Error ? issue.message : "Could not load tasks");
    } finally {
      setTasksLoading(false);
    }
  }

  useEffect(() => {
    void refreshTasks();
  }, []);

  async function handleSaveTask(payload: TaskPayload, id?: string) {
    await saveTask(payload, id);
    await refreshTasks();
  }

  async function handleToggleTask(task: TaskItem) {
    const isCompleting = task.status === "open";
    const isRecurring = isCompleting && task.recurrence !== "none";

    if (isRecurring) {
      // Create a completed snapshot of this occurrence
      await saveTask({
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        recurrence: "none",
        priority: task.priority,
        status: "done",
        color: task.color,
        icon: task.icon,
        completedAt: new Date().toISOString()
      });
      // Advance the recurring task to the next due date
      await saveTask(
        {
          title: task.title,
          description: task.description,
          dueDate: getNextRecurringDueDate(task.dueDate, task.recurrence),
          recurrence: task.recurrence,
          priority: task.priority,
          status: "open",
          color: task.color,
          icon: task.icon,
          completedAt: null
        },
        task.id
      );
    } else {
      // Non-recurring: just toggle status
      await saveTask(
        {
          title: task.title,
          description: task.description,
          dueDate: task.dueDate,
          recurrence: task.recurrence,
          priority: task.priority,
          status: task.status === "done" ? "open" : "done",
          color: task.color,
          icon: task.icon,
          completedAt: task.status === "done" ? null : new Date().toISOString()
        },
        task.id
      );
    }
    await refreshTasks();
  }

  async function handleDeleteTask(id: string) {
    await deleteTask(id);
    await refreshTasks();
  }

  async function handleBackupDownload() {
    setBackupBusy(true);
    setBackupError(null);
    try {
      await downloadMarkdownBackup();
    } catch (issue) {
      setBackupError(issue instanceof Error ? issue.message : "Could not export backup");
    } finally {
      setBackupBusy(false);
    }
  }

  const filteredMemories = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    if (!normalized) {
      return memories;
    }

    return memories.filter((memory) =>
      [memory.title, memory.description, memory.tags.join(" ")].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [deferredQuery, memories]);

  const filteredChunks = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    if (!normalized) {
      return chunks;
    }

    return chunks.filter((chunk) => [chunk.title, chunk.description].some((value) => value.toLowerCase().includes(normalized)));
  }, [chunks, deferredQuery]);

  return (
    <main className="app-shell">
      <motion.section className="topbar" initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42 }}>
        <div>
          <p className="eyebrow">Your all-in-one life tracking application</p>
          <h1>LifeTrac</h1>
        </div>

        <div className="topbar-actions">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memories" />
          </label>

          <div className="segmented" aria-label="View">
            {viewConfig.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  className={view === option.id ? "active" : ""}
                  key={option.id}
                  onClick={() => setView(option.id)}
                  type="button"
                  title={option.label}
                >
                  <Icon size={16} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>

          <button className="primary-action" onClick={() => setEditor({ type: "memory", mode: "create" })} type="button">
            <Plus size={18} />
            Memory
          </button>

          <button className="secondary-action" onClick={() => setEditor({ type: "chunk", mode: "create" })} type="button">
            <ListPlus size={18} />
            Chunk
          </button>

          <button
            className="secondary-action"
            disabled={backupBusy}
            onClick={() => void handleBackupDownload()}
            title="Download Markdown backup"
            type="button"
          >
            <Download size={18} />
            {backupBusy ? "Exporting" : "Backup"}
          </button>

          {isHostedMode && <AccountBadge avatarUrl={getAvatarUrl(user)} email={user?.email || "Signed in"} onSignOut={signOut} />}
        </div>
      </motion.section>

      {backupError && <div className="status-message error">{backupError}</div>}

      <MonthCalendarHub chunks={chunks} memories={memories} tasks={tasks} />

      <TaskCommandCenter
        error={taskError}
        loading={tasksLoading}
        onDelete={handleDeleteTask}
        onSave={handleSaveTask}
        onToggle={handleToggleTask}
        tasks={tasks}
      />

      {error && <div className="status-message error">{error}</div>}
      {loading && <div className="status-message">Loading timeline...</div>}

      <AnimatePresence mode="wait">
        {!loading && view === "timeline" && (
          <NestedTimelineView
            chunks={filteredChunks}
            chunkMap={chunkMap}
            memories={filteredMemories}
            onEditChunk={(item) => setEditor({ type: "chunk", mode: "edit", item })}
            onEditMemory={(item) => setEditor({ type: "memory", mode: "edit", item })}
          />
        )}
        {!loading && view === "diary" && (
          <DiaryView
            chunks={filteredChunks}
            memories={filteredMemories}
            onEditMemory={(item) => setEditor({ type: "memory", mode: "edit", item })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editor && (
          <EditorPanel
            editor={editor}
            onClose={() => setEditor(null)}
            onSaved={async () => {
              setEditor(null);
              await refresh();
            }}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function AccountBadge({ avatarUrl, email, onSignOut }: { avatarUrl: string | null; email: string; onSignOut: () => Promise<void> }) {
  return (
    <div className="account-badge" title={email}>
      {avatarUrl ? <img alt="" src={avatarUrl} /> : <span>{email.slice(0, 1).toUpperCase()}</span>}
      <small>{email}</small>
      <button aria-label="Sign out" onClick={() => void onSignOut()} type="button">
        <LogOut size={16} />
      </button>
    </div>
  );
}

function getAvatarUrl(user: ReturnType<typeof useAuth>["user"]) {
  const metadata = user?.user_metadata as { avatar_url?: string; picture?: string } | undefined;
  return metadata?.avatar_url || metadata?.picture || null;
}

function MonthCalendarHub({ chunks, memories, tasks }: { chunks: LifeChunk[]; memories: MemoryItem[]; tasks: TaskItem[] }) {
  const today = todayKey();
  const [month, setMonth] = useState(() => firstOfMonth(today));
  const [activeDay, setActiveDay] = useState(today);
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [busy, setBusy] = useState<"connect" | "refresh" | "sources" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => getMonthGrid(month), [month]);
  const rangeStart = days[0]?.key || month;
  const rangeEnd = nextDateKey(days.at(-1)?.key || month);
  const selectedSourceKey = status?.calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id).join("|") || "";

  useEffect(() => {
    let ignore = false;
    void getGoogleCalendarStatus()
      .then((nextStatus) => {
        if (!ignore) {
          setStatus(nextStatus);
        }
      })
      .catch((issue) => {
        if (!ignore) {
          setError(issue instanceof Error ? issue.message : "Could not read Google Calendar status");
        }
      });

    const currentUrl = new URL(window.location.href);
    const google = currentUrl.searchParams.get("google");
    if (google) {
      setError(google === "connected" ? null : currentUrl.searchParams.get("reason") || "Google Calendar connection failed");
      currentUrl.searchParams.delete("google");
      currentUrl.searchParams.delete("reason");
      window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    }

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!status?.connected || !selectedSourceKey) {
      setEvents([]);
      return;
    }

    let ignore = false;
    void getGoogleCalendarEvents(rangeStart, rangeEnd)
      .then((response) => {
        if (!ignore) {
          setEvents(response.events);
        }
      })
      .catch((issue) => {
        if (!ignore) {
          setError(issue instanceof Error ? issue.message : "Could not load Google Calendar events");
        }
      });

    return () => {
      ignore = true;
    };
  }, [rangeEnd, rangeStart, selectedSourceKey, status?.connected]);

  const selectedDay = {
    chunks: chunks.filter((chunk) => chunkTouchesDay(chunk, activeDay)),
    events: events.filter((event) => googleEventTouchesDay(event, activeDay)),
    memories: memories.filter((memory) => memoryTouchesDay(memory, activeDay)),
    tasks: tasks.filter((task) => task.dueDate === activeDay)
  };

  async function connect() {
    setBusy("connect");
    setError(null);
    try {
      window.location.assign((await getGoogleCalendarAuthUrl()).url);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not start Google connection");
      setBusy(null);
    }
  }

  async function refreshSources() {
    setBusy("refresh");
    setError(null);
    try {
      const calendars = await refreshGoogleCalendars();
      setStatus((current) => (current ? { ...current, calendars, lastSyncedAt: new Date().toISOString() } : current));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not refresh Google calendars");
    } finally {
      setBusy(null);
    }
  }

  async function toggleSource(calendar: GoogleCalendarSummary) {
    if (!status) {
      return;
    }

    setBusy("sources");
    setError(null);
    try {
      const selectedIds = status.calendars
        .filter((source) => (source.id === calendar.id ? !source.selected : source.selected))
        .map((source) => source.id);
      setStatus({ ...status, calendars: await selectGoogleCalendars(selectedIds) });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not update Google calendars");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    setError(null);
    try {
      await disconnectGoogleCalendar();
      setEvents([]);
      setStatus((current) => (current ? { ...current, calendars: [], connected: false, lastSyncedAt: null } : current));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not disconnect Google Calendar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="month-calendar-hub calendar-glow-surface"
      initial={{ opacity: 0, y: 18 }}
      onPointerMove={handleGlowMove}
    >
      <div className="month-hub-header">
        <div>
          <small>Calendar hub</small>
          <h2>{monthLabel(month)}</h2>
        </div>
        <div className="month-hub-controls">
          <button onClick={() => setMonth(shiftMonth(month, -1))} title="Previous month" type="button">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => { setMonth(firstOfMonth(today)); setActiveDay(today); }} type="button">Today</button>
          <button onClick={() => setMonth(shiftMonth(month, 1))} title="Next month" type="button">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="month-hub-sourcebar">
        <span className="calendar-source-status">
          <CalendarClock size={17} />
          {status?.connected ? `${status.calendars.filter((calendar) => calendar.selected).length} Google sources` : "LifeTrac local sources"}
        </span>
        {status?.connected ? (
          <>
            <details className="calendar-source-picker">
              <summary>Google calendars</summary>
              <div>
                {status.calendars.map((calendar) => (
                  <label key={calendar.id}>
                    <input checked={calendar.selected} disabled={busy === "sources"} onChange={() => void toggleSource(calendar)} type="checkbox" />
                    <span style={{ "--accent": calendar.color } as CSSProperties} />
                    {calendar.summary}
                  </label>
                ))}
              </div>
            </details>
            <button disabled={Boolean(busy)} onClick={() => void refreshSources()} type="button">Refresh</button>
            <button disabled={busy === "disconnect"} onClick={() => void disconnect()} type="button">Disconnect</button>
          </>
        ) : (
          <button disabled={!status?.configured || busy === "connect"} onClick={() => void connect()} type="button">Connect Google</button>
        )}
      </div>

      {!status?.configured && status && <p className="calendar-setup-note">Google Calendar OAuth is not configured yet.</p>}
      {error && <div className="status-message error">{error}</div>}

      <div className="month-hub-body">
        <div className="month-grid-shell">
          <div className="month-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="month-day-grid">
            {days.map((day) => (
              <MonthDay
                active={day.key === activeDay}
                chunks={chunks.filter((chunk) => chunkTouchesDay(chunk, day.key))}
                events={events.filter((event) => googleEventTouchesDay(event, day.key))}
                inMonth={day.inMonth}
                key={day.key}
                memoryCount={memories.filter((memory) => memoryTouchesDay(memory, day.key)).length}
                onSelect={() => setActiveDay(day.key)}
                tasks={tasks.filter((task) => task.dueDate === day.key)}
                today={day.key === today}
                value={day.key}
              />
            ))}
          </div>
        </div>
        <aside className="month-day-detail" aria-label={`${readableDate(activeDay)} calendar detail`}>
          <small>{readableDate(activeDay)}</small>
          <DayDetailGroup empty="No Google events on this day." items={selectedDay.events.map((event) => ({ accent: event.color, meta: event.allDay ? "All day" : formatEventTime(event), title: event.title }))} title="Schedule" />
          <DayDetailGroup empty="No tasks due." items={selectedDay.tasks.map((task) => ({ accent: task.color, meta: task.status === "done" ? "Completed" : formatTaskRecurrence(task.recurrence), title: task.title }))} title="Tasks" />
          <DayDetailGroup empty="No memories here yet." items={selectedDay.memories.map((memory) => ({ accent: getMemoryChunkColor(memory, chunks), meta: formatDateLabel(memory), title: memory.title }))} title="Memories" />
          <DayDetailGroup empty="No life chunk spans this day." items={selectedDay.chunks.map((chunk) => ({ accent: chunk.color, meta: `${readableDate(chunk.startDate)} - ${readableDate(chunk.endDate)}`, title: chunk.title }))} title="Life chunks" />
        </aside>
      </div>
    </motion.section>
  );
}

function MonthDay({
  active,
  chunks,
  events,
  inMonth,
  memoryCount,
  onSelect,
  tasks,
  today,
  value
}: {
  active: boolean;
  chunks: LifeChunk[];
  events: GoogleCalendarEvent[];
  inMonth: boolean;
  memoryCount: number;
  onSelect: () => void;
  tasks: TaskItem[];
  today: boolean;
  value: string;
}) {
  const eventGroups = groupGoogleEventsByCalendar(events);
  const previewTasks = tasks.slice(0, 3);
  const taskOverflow = tasks.length - previewTasks.length;

  return (
    <button className={`${active ? "active" : ""} ${inMonth ? "" : "outside"} ${today ? "today" : ""}`} onClick={onSelect} type="button">
      <strong>{Number(value.slice(-2))}</strong>
      <div className="month-day-chunks">
        {chunks.slice(0, 2).map((chunk) => <span key={chunk.id} style={{ "--accent": chunk.color } as CSSProperties} title={chunk.title} />)}
      </div>
      <div className="month-day-counts">
        {eventGroups.map((group) => (
          <span
            className="google-count"
            key={group.calendarId}
            style={{ "--accent": group.color } as CSSProperties}
            title={`${group.count} ${group.calendarSummary} Google event${group.count === 1 ? "" : "s"}`}
          >
            {group.count} event{group.count === 1 ? "" : "s"}
            <b aria-label="Google Calendar">G</b>
          </span>
        ))}
        {previewTasks.map((task) => (
          <span
            className={`task-preview ${task.status === "done" ? "done" : ""}`}
            key={task.id}
            style={{ "--accent": task.color } as CSSProperties}
            title={task.title}
          >
            <i>{task.title}</i>
          </span>
        ))}
        {taskOverflow > 0 && <span className="task-count">+{taskOverflow} task{taskOverflow === 1 ? "" : "s"}</span>}
        {memoryCount > 0 && <span className="memory-count">{memoryCount} memory</span>}
      </div>
    </button>
  );
}

function groupGoogleEventsByCalendar(events: GoogleCalendarEvent[]) {
  return Array.from(
    events.reduce((groups, event) => {
      const group = groups.get(event.calendarId);
      if (group) {
        group.count += 1;
      } else {
        groups.set(event.calendarId, {
          calendarId: event.calendarId,
          calendarSummary: event.calendarSummary,
          color: event.color,
          count: 1
        });
      }

      return groups;
    }, new Map<string, { calendarId: string; calendarSummary: string; color: string; count: number }>())
  ).map(([_calendarId, group]) => group);
}

function DayDetailGroup({
  empty,
  items,
  title
}: {
  empty: string;
  items: Array<{ accent: string; meta: string; title: string }>;
  title: string;
}) {
  return (
    <section className="day-detail-group">
      <h3>{title}</h3>
      {items.length ? items.map((item, index) => (
        <div className="day-detail-item" key={`${title}-${item.title}-${index}`}>
          <span style={{ "--accent": item.accent } as CSSProperties} />
          <strong>{item.title}</strong>
          <small>{item.meta}</small>
        </div>
      )) : <p>{empty}</p>}
    </section>
  );
}

function todayKey() {
  return dateKey(new Date());
}

function firstOfMonth(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function shiftMonth(value: string, offset: number) {
  const date = dateFromKey(value);
  return dateKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)));
}

function getMonthGrid(month: string) {
  const first = dateFromKey(firstOfMonth(month));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());

  return Array.from({ length: 42 }, (_unused, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = dateKey(date);
    return { key, inMonth: key.slice(0, 7) === month.slice(0, 7) };
  });
}

function nextDateKey(value: string) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return dateKey(date);
}

function chunkTouchesDay(chunk: Pick<LifeChunk, "startDate" | "endDate">, day: string) {
  return chunk.startDate <= day && chunk.endDate >= day;
}

function memoryTouchesDay(memory: Pick<MemoryItem, "datePrecision" | "startDate" | "endDate">, day: string) {
  if (memory.datePrecision === "month") {
    return memory.startDate.slice(0, 7) === day.slice(0, 7);
  }

  return memory.startDate <= day && (memory.endDate || memory.startDate) >= day;
}

function googleEventTouchesDay(event: GoogleCalendarEvent, day: string) {
  if (event.allDay) {
    return event.start <= day && event.end > day;
  }

  const dayStart = localDateFromKey(day).getTime();
  const dayEnd = localDateFromKey(nextDateKey(day)).getTime();
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  return start < dayEnd && Math.max(end, start + 1) > dayStart;
}

function formatEventTime(event: GoogleCalendarEvent) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(event.start));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateFromKey(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function localDateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const emptyTaskDraft: TaskPayload = {
  title: "",
  description: "",
  dueDate: "",
  recurrence: "none",
  priority: "medium",
  status: "open",
  color: colorOptions[1],
  icon: "check-circle"
};

function TaskCommandCenter({
  error,
  loading,
  onDelete,
  onSave,
  onToggle,
  tasks
}: {
  error: string | null;
  loading: boolean;
  onDelete: (id: string) => Promise<void>;
  onSave: (payload: TaskPayload, id?: string) => Promise<void>;
  onToggle: (task: TaskItem) => Promise<void>;
  tasks: TaskItem[];
}) {
  const [draft, setDraft] = useState<TaskPayload>(emptyTaskDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);
  const completedPanelRef = useRef<HTMLDivElement | null>(null);
  const completedListRef = useRef<HTMLDivElement | null>(null);
  const openTasks = tasks.filter((task) => task.status === "open");
  const completedTasks = tasks.filter((task) => task.status === "done");
  const recurringTasks = tasks.filter((task) => task.recurrence !== "none");

  useLayoutEffect(() => {
    const panel = completedPanelRef.current;
    const list = completedListRef.current;
    if (!panel || !list) {
      return;
    }

    const syncHeight = () => panel.style.setProperty("--completed-panel-height", `${list.scrollHeight}px`);
    syncHeight();

    const observer = new ResizeObserver(syncHeight);
    observer.observe(list);
    return () => observer.disconnect();
  }, [completedTasks.length]);

  const updateDraft = <K extends keyof TaskPayload>(key: K, value: TaskPayload[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusyTaskId(editingId || "new");
    try {
      await onSave({ ...draft, dueDate: draft.dueDate || null }, editingId || undefined);
      setDraft(emptyTaskDraft);
      setEditingId(null);
    } finally {
      setBusyTaskId(null);
    }
  }

  function editTask(task: TaskItem) {
    setEditingId(task.id);
    setDraft({
      title: task.title,
      description: task.description,
      dueDate: task.dueDate || "",
      recurrence: task.recurrence,
      priority: task.priority,
      status: task.status,
      color: task.color,
      icon: task.icon
    });
  }

  async function runTaskAction(id: string, action: () => Promise<void>) {
    setBusyTaskId(id);
    try {
      await action();
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <motion.section
      className="task-command-center reactive-surface"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.42 }}
      onPointerMove={handleReactiveMove}
      onPointerLeave={resetReactiveMove}
    >
      <div className="task-panel-header">
        <div>
          <small>Life queue</small>
          <h2>Tasks, routines, and reminders</h2>
        </div>
        <div className="task-stats" aria-label="Task summary">
          <span>{openTasks.length} open</span>
          <span>{recurringTasks.length} recurring</span>
        </div>
      </div>

      <form className="task-form" onSubmit={handleSubmit}>
        <label className="task-title-field">
          Task
          <input
            onChange={(event) => updateDraft("title", event.target.value)}
            placeholder="Add a task or routine"
            required
            value={draft.title}
          />
        </label>

        <label>
          Due
          <input onChange={(event) => updateDraft("dueDate", event.target.value)} type="date" value={draft.dueDate || ""} />
        </label>

        <label>
          Repeats
          <select onChange={(event) => updateDraft("recurrence", event.target.value as TaskRecurrence)} value={draft.recurrence}>
            <option value="none">One-off</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>

        <label>
          Priority
          <select onChange={(event) => updateDraft("priority", event.target.value as TaskPriority)} value={draft.priority}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>

        <label>
          Icon
          <select onChange={(event) => updateDraft("icon", event.target.value)} value={draft.icon}>
            {iconOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="task-notes-field">
          Notes
          <textarea
            onChange={(event) => updateDraft("description", event.target.value)}
            placeholder="Optional detail, context, or checklist cue"
            rows={2}
            value={draft.description || ""}
          />
        </label>

        <span className="task-color-field">
          Color
          <span className="task-swatches">
            {colorOptions.map((option) => (
              <button
                aria-label={`Use ${option}`}
                className={draft.color === option ? "selected" : ""}
                key={option}
                onClick={() => updateDraft("color", option)}
                style={{ background: option }}
                type="button"
              />
            ))}
          </span>
        </span>

        <div className="task-form-actions">
          {editingId && (
            <button
              className="secondary-action"
              onClick={() => {
                setEditingId(null);
                setDraft(emptyTaskDraft);
              }}
              type="button"
            >
              Cancel
            </button>
          )}
          <button className="primary-action" disabled={busyTaskId === "new" || Boolean(editingId && busyTaskId === editingId)} type="submit">
            <Plus size={17} />
            {editingId ? "Update task" : "Add task"}
          </button>
        </div>
      </form>

      {error && <div className="status-message error">{error}</div>}
      {loading ? (
        <div className="status-message">Loading tasks...</div>
      ) : (
        <>
          <motion.div className="task-list" initial="hidden" animate="show" variants={taskListVariants}>
            {openTasks.map((task) => (
              <TaskCard
                busy={busyTaskId === task.id}
                key={task.id}
                onDelete={() => runTaskAction(task.id, () => onDelete(task.id))}
                onEdit={() => editTask(task)}
                onToggle={() => runTaskAction(task.id, () => onToggle(task))}
                task={task}
              />
            ))}
          </motion.div>

          {completedTasks.length > 0 && (
            <div className="completed-tasks-section">
              <motion.button
                className={`completed-tasks-toggle ${isCompletedExpanded ? "expanded" : ""}`}
                aria-controls="completed-task-panel"
                aria-expanded={isCompletedExpanded}
                onClick={() => setIsCompletedExpanded((v) => !v)}
                transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.35 }}
                type="button"
                whileHover={{ scaleX: 1.004, scaleY: 1.018 }}
                whileTap={{ scaleX: 0.995, scaleY: 0.975 }}
              >
                <CheckCircle2 size={16} />
                <span>{completedTasks.length} completed</span>
                <ChevronDown size={16} className="toggle-arrow" />
              </motion.button>

              <div
                aria-hidden={!isCompletedExpanded}
                className={`completed-tasks-panel ${isCompletedExpanded ? "expanded" : ""}`}
                id="completed-task-panel"
                ref={completedPanelRef}
              >
                <div className="completed-tasks-list" ref={completedListRef}>
                  <div className="task-list completed-task-list">
                    {completedTasks.map((task) => (
                      <TaskCard
                        busy={busyTaskId === task.id}
                        key={task.id}
                        onDelete={() => runTaskAction(task.id, () => onDelete(task.id))}
                        onEdit={() => editTask(task)}
                        onToggle={() => runTaskAction(task.id, () => onToggle(task))}
                        task={task}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </motion.section>
  );
}

function TaskCard({
  busy,
  onDelete,
  onEdit,
  onToggle,
  task
}: {
  busy: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onToggle: () => void;
  task: TaskItem;
}) {
  const isDone = task.status === "done";

  return (
    <motion.article
      className={`task-card reactive-surface ${isDone ? "done" : ""}`}
      layout
      onPointerMove={handleReactiveMove}
      onPointerLeave={resetReactiveMove}
      style={{ "--accent": task.color } as CSSProperties}
      variants={taskCardVariants}
      whileHover={{ y: -4, scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
    >
      <button
        className="task-complete-button"
        disabled={busy}
        onClick={onToggle}
        title={isDone ? "Mark open" : "Complete task"}
        type="button"
      >
        {isDone ? <CheckCircle2 size={20} /> : <Circle size={20} />}
      </button>
      <div className="task-icon" aria-hidden="true">
        <TimelineIcon name={task.icon} size={18} />
      </div>
      <div className="task-card-body">
        <div>
          <strong>{task.title}</strong>
          {task.description && <p>{task.description}</p>}
        </div>
        <div className="task-meta-row">
          <span>
            <CalendarClock size={14} />
            {task.dueDate ? readableDate(task.dueDate) : "No due date"}
          </span>
          <span>
            <Repeat2 size={14} />
            {formatTaskRecurrence(task.recurrence)}
          </span>
          <span className={`priority-${task.priority}`}>
            <Flag size={14} />
            {task.priority}
          </span>
        </div>
      </div>
      <div className="task-card-actions">
        <button onClick={onEdit} title="Edit task" type="button">
          <Pencil size={15} />
        </button>
        <button disabled={busy} onClick={onDelete} title="Delete task" type="button">
          <Trash2 size={15} />
        </button>
      </div>
    </motion.article>
  );
}

const taskListVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.045
    }
  }
};

const taskCardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1 }
};

function formatTaskRecurrence(recurrence: TaskRecurrence) {
  if (recurrence === "none") {
    return "One-off";
  }

  return recurrence[0].toUpperCase() + recurrence.slice(1);
}

function getNextRecurringDueDate(dueDate: string | null, recurrence: TaskRecurrence) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let next = dueDate ? parseUtcDate(dueDate) : new Date(today);

  do {
    next = addRecurrence(next, recurrence);
  } while (next.getTime() <= today.getTime());

  return next.toISOString().slice(0, 10);
}

function parseUtcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day || 1));
}

function addRecurrence(date: Date, recurrence: TaskRecurrence) {
  const next = new Date(date);
  if (recurrence === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
  } else if (recurrence === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else if (recurrence === "monthly") {
    next.setUTCMonth(next.getUTCMonth() + 1);
  } else if (recurrence === "yearly") {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  }

  return next;
}

function TimelineView({
  chunks,
  chunkMap,
  memories,
  onEditChunk,
  onEditMemory
}: {
  chunks: LifeChunk[];
  chunkMap: Record<string, string[]>;
  memories: MemoryItem[];
  onEditChunk: (chunk: LifeChunk) => void;
  onEditMemory: (memory: MemoryItem) => void;
}) {
  return (
    <motion.section className="timeline-layout" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <div className="life-lane">
        {chunks.map((chunk) => {
          const contained = memories.filter((memory) => chunkMap[chunk.id]?.includes(memory.id));
          return (
            <button
              className="chunk-band"
              key={chunk.id}
              onClick={() => onEditChunk(chunk)}
              style={{ "--accent": chunk.color } as CSSProperties}
              type="button"
            >
              <span className="icon-bubble">
                <TimelineIcon name={chunk.icon} />
              </span>
              <span>
                <strong>{chunk.title}</strong>
                <small>
                  {readableDate(chunk.startDate)} - {readableDate(chunk.endDate)} • {contained.length} memories
                </small>
              </span>
            </button>
          );
        })}
      </div>

      <div className="timeline-track">
        {memories.map((memory, index) => (
          <motion.button
            className="memory-node"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.04 }}
            key={memory.id}
            onClick={() => onEditMemory(memory)}
            style={{ "--accent": memory.color } as CSSProperties}
            type="button"
          >
            <span className="node-dot">
              <TimelineIcon name={memory.icon} size={16} />
            </span>
            <span className="node-content">
              <small>{formatDateLabel(memory)}</small>
              <strong>{memory.title}</strong>
              <span>{memory.description}</span>
              <MediaStrip media={memory.media} />
            </span>
          </motion.button>
        ))}
      </div>
    </motion.section>
  );
}

function NestedTimelineView({
  chunks,
  chunkMap,
  memories,
  onEditChunk,
  onEditMemory
}: {
  chunks: LifeChunk[];
  chunkMap: Record<string, string[]>;
  memories: MemoryItem[];
  onEditChunk: (chunk: LifeChunk) => void;
  onEditMemory: (memory: MemoryItem) => void;
}) {
  const sections = useMemo(() => {
    const assignedIds = new Set<string>();
    const chunkSections = chunks.map((chunk) => {
      const childMemories = memories.filter((memory) => chunkMap[chunk.id]?.includes(memory.id));
      childMemories.forEach((memory) => assignedIds.add(memory.id));
      return { id: chunk.id, chunk, memories: childMemories };
    });
    const unassigned = memories.filter((memory) => !assignedIds.has(memory.id));

    return unassigned.length ? [...chunkSections, { id: "outside-chunks", chunk: null, memories: unassigned }] : chunkSections;
  }, [chunkMap, chunks, memories]);
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id || "");
  const [isIndexCollapsed, setIndexCollapsed] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!sections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(sections[0]?.id || "");
    }
  }, [activeSectionId, sections]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const focused = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (focused?.target instanceof HTMLElement) {
          setActiveSectionId(focused.target.dataset.sectionId || "");
        }
      },
      {
        rootMargin: "-28% 0px -48% 0px",
        threshold: [0.16, 0.32, 0.56]
      }
    );

    Object.values(sectionRefs.current).forEach((node) => {
      if (node) {
        observer.observe(node);
      }
    });

    return () => observer.disconnect();
  }, [sections]);

  function scrollToSection(id: string) {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <motion.section className="timeline-combined" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <TimelineCalendarOverview
        chunks={chunks}
        memories={memories}
        onEditChunk={onEditChunk}
        onEditMemory={onEditMemory}
      />

      <div className="timeline-scroll-label">
        <span />
        <small>Scroll into the detailed timeline</small>
      </div>

      <div className={`timeline-layout nested-timeline-layout ${isIndexCollapsed ? "index-collapsed" : ""}`}>
        <aside className={`timeline-index ${isIndexCollapsed ? "collapsed" : ""}`} aria-label="Timeline sections">
          <div className="timeline-index-header">
            <span className="timeline-index-title">
              <small>Timeline index</small>
              <strong>{sections.length} sections</strong>
            </span>
            <button onClick={() => setIndexCollapsed((value) => !value)} title={isIndexCollapsed ? "Expand index" : "Collapse index"} type="button">
              {isIndexCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
            </button>
          </div>

          <div className="timeline-index-scroll">
            <span className="timeline-spine" />
            {sections.map((section) => (
              <div className="timeline-index-group" key={section.id}>
                <button
                  className={activeSectionId === section.id ? "active" : ""}
                  onClick={() => scrollToSection(section.id)}
                  style={{ "--accent": section.chunk?.color || "#687376" } as CSSProperties}
                  type="button"
                >
                  <span className="index-marker">
                    {section.chunk ? <TimelineIcon name={section.chunk.icon} size={15} /> : <Layers3 size={15} />}
                  </span>
                  <span className="timeline-index-copy">
                    <strong>{section.chunk?.title || "Outside chunks"}</strong>
                    <small>{section.memories.length} memories</small>
                  </span>
                </button>
                {section.memories.length > 0 && (
                  <div className="timeline-index-memories">
                    {groupMemoriesForIndex(section.memories).map((group) => (
                      <div className="timeline-index-month" key={group.key}>
                        <small>{group.label}</small>
                        {group.memories.map((memory) => (
                          <button key={memory.id} onClick={() => onEditMemory(memory)} style={{ "--accent": memory.color } as CSSProperties} type="button">
                            <span />
                            <strong>{memory.title}</strong>
                            <small>{formatDateLabel(memory)}</small>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

      <div className="timeline-sections">
        {sections.map((section) => (
          <article
            className={`chunk-section reactive-surface ${activeSectionId === section.id ? "active" : ""}`}
            data-section-id={section.id}
            key={section.id}
            onPointerMove={handleReactiveMove}
            onPointerLeave={resetReactiveMove}
            ref={(node) => {
              sectionRefs.current[section.id] = node;
            }}
            style={{ "--accent": section.chunk?.color || "#687376" } as CSSProperties}
          >
            <span className="chunk-timeline-dot" aria-hidden="true" />
            {section.chunk ? (
              <button className="chunk-hero" onClick={() => onEditChunk(section.chunk)} type="button">
                <span className="icon-bubble">
                  <TimelineIcon name={section.chunk.icon} />
                </span>
                <span>
                  <small>
                    {readableDate(section.chunk.startDate)} - {readableDate(section.chunk.endDate)}
                  </small>
                  <strong>{section.chunk.title}</strong>
                  <span>{section.chunk.description}</span>
                  <MediaStrip media={section.chunk.media} />
                </span>
                <b>{section.memories.length}</b>
              </button>
            ) : (
              <div className="chunk-hero orphan-hero">
                <span className="icon-bubble">
                  <Layers3 size={18} />
                </span>
                <span>
                  <small>Memories without a matching life chunk</small>
                  <strong>Outside chunks</strong>
                  <span>Create or extend a life chunk to visually contain these memories.</span>
                </span>
                <b>{section.memories.length}</b>
              </div>
            )}

            <div className="chunk-children">
              {section.memories.length ? (
                section.memories.map((memory) => (
                  <button
                    className="nested-memory-card"
                    key={memory.id}
                    onClick={() => onEditMemory(memory)}
                    style={{ "--accent": section.chunk?.color || memory.color } as CSSProperties}
                    type="button"
                  >
                    <span className="memory-branch">
                      <span className="node-dot">
                        <TimelineIcon name={memory.icon} size={15} />
                      </span>
                    </span>
                    <span className="node-content">
                      <small>{formatDateLabel(memory)}</small>
                      <strong>{memory.title}</strong>
                      <span>{memory.description}</span>
                      <MediaStrip media={memory.media} />
                    </span>
                  </button>
                ))
              ) : (
                <div className="empty-children">No memories inside this chunk yet.</div>
              )}
            </div>
          </article>
        ))}
      </div>
      </div>
    </motion.section>
  );
}

function groupMemoriesForIndex(memories: MemoryItem[]) {
  const groups = new Map<string, MemoryItem[]>();
  memories.forEach((memory) => {
    const key = memory.startDate.slice(0, 7);
    groups.set(key, [...(groups.get(key) || []), memory]);
  });

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupedMemories]) => ({
      key,
      label: monthLabel(`${key}-01`),
      memories: groupedMemories
    }));
}

function getMemoryChunkColor(memory: MemoryItem, chunks: LifeChunk[]) {
  return chunks.find((chunk) => overlapsDateRange(memory, chunk))?.color || memory.color;
}

function TimelineCalendarOverview({
  chunks,
  memories,
  onEditChunk,
  onEditMemory
}: {
  chunks: LifeChunk[];
  memories: MemoryItem[];
  onEditChunk: (chunk: LifeChunk) => void;
  onEditMemory: (memory: MemoryItem) => void;
}) {
  const [granularity, setGranularity] = useState<"overview" | "month" | "week">("overview");
  const [filters, setFilters] = useState<CalendarFilters>({ years: [], months: [], chunkId: "" });
  const years = useMemo(() => getOverviewYears(memories, chunks), [chunks, memories]);
  const filterOptions = useMemo(() => getFilterOptions(memories, chunks), [chunks, memories]);
  const filteredDetail = useMemo(() => filterTimelineDetail(memories, chunks, filters), [chunks, filters, memories]);
  const calendarHeading = getCalendarHeading(granularity, years, filteredDetail, filters);

  return (
    <section className="calendar-overview-panel calendar-glow-surface" onPointerMove={handleGlowMove}>
      <div className="overview-header">
        <div>
          <small>Big picture calendar</small>
          <h2>{calendarHeading}</h2>
        </div>
        <div className="overview-toggle" aria-label="Calendar granularity">
          <button className={granularity === "overview" ? "active" : ""} onClick={() => setGranularity("overview")} type="button">
            Overview
          </button>
          <button className={granularity === "month" ? "active" : ""} onClick={() => setGranularity("month")} type="button">
            Month detail
          </button>
          <button className={granularity === "week" ? "active" : ""} onClick={() => setGranularity("week")} type="button">
            Week detail
          </button>
        </div>
      </div>

      {granularity !== "overview" && (
        <CalendarFilterBar
          chunks={chunks}
          filters={filters}
          months={filterOptions.months}
          onChange={setFilters}
          years={filterOptions.years}
        />
      )}

      {granularity === "overview" ? (
        <div className="overview-year-grid">
          {years.map((year) => (
            <article className="overview-year-card reactive-surface" key={year.year} onPointerMove={handleReactiveMove} onPointerLeave={resetReactiveMove}>
              <h3>{year.year}</h3>
              <div className="overview-year-months">
                {year.months.map((month) => (
                  <span key={month.key}>{month.shortLabel}</span>
                ))}
              </div>
              <div className="overview-year-bars">
                {year.chunks.map((chunk) => (
                  <button
                    className="overview-chunk-bar"
                    key={chunk.chunk.id}
                    onClick={() => onEditChunk(chunk.chunk)}
                    style={{ "--accent": chunk.chunk.color, gridColumn: `${chunk.startMonth} / ${chunk.endMonth + 1}` } as CSSProperties}
                    type="button"
                  >
                    <TimelineIcon name={chunk.chunk.icon} size={16} />
                    <span>{chunk.chunk.title}</span>
                  </button>
                ))}
              </div>
              <div className="overview-memory-list">
                {year.memories.map((memory) => (
                  <button
                    className="overview-memory-item"
                    key={memory.id}
                    onClick={() => onEditMemory(memory)}
                    style={{ "--accent": getMemoryChunkColor(memory, chunks) } as CSSProperties}
                    title={`${formatDateLabel(memory)} ${memory.title}`}
                    type="button"
                  >
                    <span>
                      <TimelineIcon name={memory.icon} size={14} />
                    </span>
                    <strong>{memory.title}</strong>
                    <small>{formatDateLabel(memory)}</small>
                  </button>
                ))}
              </div>
            </article>
          ))}
          </div>
      ) : granularity === "month" ? (
        <CalendarView
          chunks={filteredDetail.chunks}
          filters={filters}
          memories={filteredDetail.memories}
          onEditChunk={onEditChunk}
          onEditMemory={onEditMemory}
        />
      ) : (
        <WeekDetailView chunks={filteredDetail.chunks} filters={filters} memories={filteredDetail.memories} onEditMemory={onEditMemory} />
      )}
    </section>
  );
}

function CalendarFilterBar({
  chunks,
  filters,
  months,
  onChange,
  years
}: {
  chunks: LifeChunk[];
  filters: CalendarFilters;
  months: { label: string; value: string }[];
  onChange: (filters: CalendarFilters) => void;
  years: string[];
}) {
  const [openFilter, setOpenFilter] = useState<"years" | "months" | null>(null);
  const toggleFilterValue = (key: "years" | "months", value: string) => {
    const current = filters[key];
    onChange({
      ...filters,
      [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort()
    });
  };

  return (
    <div className="calendar-filter-bar">
      <MultiSelectDropdown
        label="Years"
        open={openFilter === "years"}
        options={years.map((year) => ({ label: year, value: year }))}
        placeholder="All years"
        selected={filters.years}
        onOpenChange={(open) => setOpenFilter(open ? "years" : null)}
        onToggle={(value) => toggleFilterValue("years", value)}
      />
      <MultiSelectDropdown
        label="Months"
        open={openFilter === "months"}
        options={months}
        placeholder="All months"
        selected={filters.months}
        onOpenChange={(open) => setOpenFilter(open ? "months" : null)}
        onToggle={(value) => toggleFilterValue("months", value)}
      />
      <label>
        Life chunk
        <select value={filters.chunkId} onChange={(event) => onChange({ ...filters, chunkId: event.target.value })}>
          <option value="">All chunks</option>
          {chunks.map((chunk) => (
            <option key={chunk.id} value={chunk.id}>
              {chunk.title}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={() => {
          setOpenFilter(null);
          onChange({ years: [], months: [], chunkId: "" });
        }}
        type="button"
      >
        Clear
      </button>
    </div>
  );
}

function MultiSelectDropdown({
  label,
  onToggle,
  onOpenChange,
  open,
  options,
  placeholder,
  selected
}: {
  label: string;
  onToggle: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  options: { label: string; value: string }[];
  placeholder: string;
  selected: string[];
}) {
  const selectedLabels = options.filter((option) => selected.includes(option.value)).map((option) => option.label);

  return (
    <div className={`multi-select-dropdown ${open ? "open" : ""}`}>
      <button className="multi-select-trigger" onClick={() => onOpenChange(!open)} type="button">
        <span>{label}</span>
        <strong>{selectedLabels.length ? selectedLabels.join(", ") : placeholder}</strong>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="multi-select-menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
          >
            {options.map((option) => (
              <label key={option.value}>
                <input checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} type="checkbox" />
                <span>{option.label}</span>
              </label>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DiaryView({
  chunks,
  memories,
  onEditMemory
}: {
  chunks: LifeChunk[];
  memories: MemoryItem[];
  onEditMemory: (memory: MemoryItem) => void;
}) {
  return (
    <motion.section className="diary-grid" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      {memories.map((memory) => (
        <button
          className="diary-card reactive-surface"
          key={memory.id}
          onClick={() => onEditMemory(memory)}
          onPointerMove={handleReactiveMove}
          onPointerLeave={resetReactiveMove}
          type="button"
        >
          <div className="card-title-row">
            <span className="icon-bubble" style={{ "--accent": getMemoryChunkColor(memory, chunks) } as CSSProperties}>
              <TimelineIcon name={memory.icon} />
            </span>
            <div>
              <small>{formatDateLabel(memory)}</small>
              <strong>{memory.title}</strong>
            </div>
          </div>
          <p>{memory.description}</p>
          <div className="tag-row">{memory.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <MediaStrip media={memory.media} />
        </button>
      ))}
    </motion.section>
  );
}

function CalendarView({
  chunks,
  filters,
  memories,
  onEditChunk,
  onEditMemory
}: {
  chunks: LifeChunk[];
  filters: CalendarFilters;
  memories: MemoryItem[];
  onEditChunk: (chunk: LifeChunk) => void;
  onEditMemory: (memory: MemoryItem) => void;
}) {
  const months = useMemo(() => groupByMonth(memories, chunks, filters), [memories, chunks, filters]);

  return (
    <motion.section className="calendar-grid" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      {months.map((month) => (
        <article className="month-card reactive-surface" key={month.key} onPointerMove={handleReactiveMove} onPointerLeave={resetReactiveMove}>
          <h2>{month.label}</h2>
          <div className="month-chunks">
            {month.chunks.map((chunk) => (
              <button key={chunk.id} onClick={() => onEditChunk(chunk)} style={{ "--accent": chunk.color } as CSSProperties} type="button">
                <TimelineIcon name={chunk.icon} size={15} />
                {chunk.title}
              </button>
            ))}
          </div>
          <div className="month-events">
            {month.memories.map((memory) => (
              <button key={memory.id} onClick={() => onEditMemory(memory)} type="button">
                <span style={{ background: getMemoryChunkColor(memory, chunks) }} />
                <strong>{memory.title}</strong>
                <small>{formatDateLabel(memory)}</small>
              </button>
            ))}
          </div>
        </article>
      ))}
    </motion.section>
  );
}

function WeekDetailView({
  chunks,
  filters,
  memories,
  onEditMemory
}: {
  chunks: LifeChunk[];
  filters: CalendarFilters;
  memories: MemoryItem[];
  onEditMemory: (memory: MemoryItem) => void;
}) {
  const weeks = useMemo(() => groupByWeek(memories, chunks, filters), [chunks, filters, memories]);

  return (
    <section className="week-detail-grid">
      {weeks.map((week) => (
        <article className="week-card reactive-surface" key={week.key} onPointerMove={handleReactiveMove} onPointerLeave={resetReactiveMove}>
          <div>
            <small>Week of</small>
            <h2>{week.label}</h2>
          </div>
          <div className="week-chunks">
            {week.chunks.map((chunk) => (
              <span key={chunk.id} style={{ "--accent": chunk.color } as CSSProperties}>
                <TimelineIcon name={chunk.icon} size={14} />
                {chunk.title}
              </span>
            ))}
          </div>
          <div className="week-memories">
            {week.memories.map((memory) => (
              <button key={memory.id} onClick={() => onEditMemory(memory)} type="button">
                <span style={{ background: getMemoryChunkColor(memory, chunks) }} />
                <strong>{memory.title}</strong>
                <small>{formatDateLabel(memory)}</small>
              </button>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function EditorPanel({
  editor,
  onClose,
  onSaved
}: {
  editor: EditorState;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isMemory = editor.type === "memory";
  const item = editor.item;
  const [title, setTitle] = useState(item?.title || "");
  const [description, setDescription] = useState(item?.description || "");
  const [datePrecision, setDatePrecision] = useState<DatePrecision>(
    isMemory ? (item as MemoryItem | undefined)?.datePrecision || "exact" : "range"
  );
  const [startDate, setStartDate] = useState(item?.startDate || "");
  const [endDate, setEndDate] = useState((item as MemoryItem | LifeChunk | undefined)?.endDate || "");
  const [tags, setTags] = useState(isMemory ? (item as MemoryItem | undefined)?.tags.join(", ") || "" : "");
  const [color, setColor] = useState(item?.color || colorOptions[0]);
  const [icon, setIcon] = useState(item?.icon || (isMemory ? "sparkles" : "calendar-days"));
  const [upload, setUpload] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const media = item?.media || [];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (isMemory) {
        const payload: MemoryPayload = {
          title,
          description,
          datePrecision,
          startDate,
          endDate: datePrecision === "range" ? endDate : null,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          color,
          icon
        };
        const saved = await saveMemory(payload, editor.mode === "edit" ? editor.item.id : undefined);
        if (upload) {
          await uploadImage(saved.id, "memory", upload);
        }
      } else {
        const payload: LifeChunkPayload = { title, description, startDate, endDate, color, icon };
        const saved = await saveLifeChunk(payload, editor.mode === "edit" ? editor.item.id : undefined);
        if (upload) {
          await uploadImage(saved.id, "chunk", upload);
        }
      }

      await onSaved();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (editor.mode !== "edit") {
      return;
    }

    setBusy(true);
    if (isMemory) {
      await deleteMemory(editor.item.id);
    } else {
      await deleteLifeChunk(editor.item.id);
    }
    await onSaved();
  }

  async function handleDeleteMedia(asset: MediaAsset) {
    setBusy(true);
    await deleteMedia(asset.id);
    await onSaved();
  }

  return (
    <motion.aside className="editor-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.form
        className="editor-panel"
        initial={{ x: 420 }}
        animate={{ x: 0 }}
        exit={{ x: 420 }}
        onSubmit={handleSubmit}
      >
        <div className="editor-header">
          <div>
            <small>{isMemory ? "Memory item" : "Life chunk"}</small>
            <h2>{editor.mode === "edit" ? "Edit" : "Create"}</h2>
          </div>
          <button onClick={onClose} type="button" title="Close">
            <X size={20} />
          </button>
        </div>

        {error && <div className="status-message error">{error}</div>}

        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>

        <label>
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={6} />
        </label>

        {isMemory && (
          <label>
            Date precision
            <select value={datePrecision} onChange={(event) => setDatePrecision(event.target.value as DatePrecision)}>
              <option value="exact">Exact day</option>
              <option value="month">Month</option>
              <option value="range">Range</option>
            </select>
          </label>
        )}

        <div className="two-col">
          <label>
            Start date
            <input value={startDate} onChange={(event) => setStartDate(event.target.value)} required type="date" />
          </label>
          {(datePrecision === "range" || !isMemory) && (
            <label>
              End date
              <input value={endDate} onChange={(event) => setEndDate(event.target.value)} required type="date" />
            </label>
          )}
        </div>

        {isMemory && (
          <label>
            Tags
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="school, work, reset" />
          </label>
        )}

        <div className="two-col">
          <label>
            Icon
            <select value={icon} onChange={(event) => setIcon(event.target.value)}>
              {iconOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Color
            <div className="swatches">
              {colorOptions.map((option) => (
                <button
                  aria-label={option}
                  className={color === option ? "selected" : ""}
                  key={option}
                  onClick={() => setColor(option)}
                  style={{ background: option }}
                  type="button"
                />
              ))}
            </div>
          </label>
        </div>

        <label>
          Image
          <span className="file-control">
            <Images size={17} />
            <input accept="image/*" onChange={(event) => setUpload(event.target.files?.[0] || null)} type="file" />
          </span>
        </label>

        <MediaManager media={media} onDelete={handleDeleteMedia} />

        <div className="editor-actions">
          {editor.mode === "edit" && (
            <button className="danger-action" disabled={busy} onClick={handleDelete} type="button">
              <Trash2 size={17} />
              Delete
            </button>
          )}
          <button className="primary-action" disabled={busy} type="submit">
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </motion.form>
    </motion.aside>
  );
}

function MediaStrip({ media }: { media: MediaAsset[] }) {
  if (!media.length) {
    return null;
  }

  return (
    <div className="media-strip">
      {media.slice(0, 4).map((asset) => (
        <img alt={asset.originalName} key={asset.id} src={asset.url} />
      ))}
    </div>
  );
}

function MediaManager({ media, onDelete }: { media: MediaAsset[]; onDelete: (asset: MediaAsset) => void }) {
  if (!media.length) {
    return null;
  }

  return (
    <div className="media-manager">
      {media.map((asset) => (
        <div key={asset.id}>
          <img alt={asset.originalName} src={asset.url} />
          <button onClick={() => onDelete(asset)} title="Remove image" type="button">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

function groupByMonth(memories: MemoryItem[], chunks: LifeChunk[], filters: CalendarFilters) {
  const keys = new Set<string>();
  memories.forEach((memory) => keys.add(memory.startDate.slice(0, 7)));
  chunks.forEach((chunk) => {
    monthKeysBetween(chunk.startDate, chunk.endDate).forEach((key) => keys.add(key));
  });

  return Array.from(keys)
    .sort()
    .filter((key) => monthKeyMatchesFilters(key, filters))
    .map((key) => {
      const monthStart = `${key}-01`;
      const monthEnd = monthEndDate(key);
      return {
        key,
        label: monthLabel(monthStart),
        memories: memories.filter((memory) => memory.startDate.startsWith(key)),
        chunks: chunks.filter((chunk) =>
          overlapsDateRange({ datePrecision: "range", startDate: monthStart, endDate: monthEnd } as MemoryItem, chunk)
        )
      };
    })
    .filter((month) => month.memories.length || month.chunks.length);
}

function groupByWeek(memories: MemoryItem[], chunks: LifeChunk[], filters: CalendarFilters) {
  const keys = new Set<string>();
  memories.forEach((memory) => keys.add(weekKeyForDate(memory.startDate)));
  chunks.forEach((chunk) => {
    if (filters.years.length || filters.months.length) {
      weekKeysBetween(chunk.startDate, chunk.endDate).forEach((key) => keys.add(key));
    } else {
      keys.add(weekKeyForDate(chunk.startDate));
      keys.add(weekKeyForDate(chunk.endDate));
    }
  });

  return Array.from(keys)
    .sort()
    .filter((key) => weekKeyMatchesFilters(key, filters))
    .map((key) => {
      const weekEnd = addUtcDays(key, 6);
      return {
        key,
        label: readableDate(key),
        chunks: chunks.filter((chunk) =>
          overlapsDateRange({ datePrecision: "range", startDate: key, endDate: weekEnd } as MemoryItem, chunk)
        ),
        memories: memories.filter((memory) => weekKeyForDate(memory.startDate) === key)
      };
    })
    .filter((week) => week.memories.length || week.chunks.length);
}

function monthKeyMatchesFilters(key: string, filters: CalendarFilters) {
  if (filters.years.length && !filters.years.includes(key.slice(0, 4))) {
    return false;
  }

  if (filters.months.length && !filters.months.includes(key.slice(5, 7))) {
    return false;
  }

  return true;
}

function weekKeyMatchesFilters(key: string, filters: CalendarFilters) {
  if (!filters.years.length && !filters.months.length) {
    return true;
  }

  const weekEnd = addUtcDays(key, 6);
  const ranges = getFilterDateRanges(filters);
  if (ranges.length) {
    return ranges.some((range) => overlapsDateRange({ datePrecision: "range", startDate: key, endDate: weekEnd } as MemoryItem, range));
  }

  return filters.months.length ? rangeIncludesAnyMonth(key, weekEnd, filters.months) : true;
}

function getOverviewMonths(memories: MemoryItem[], chunks: LifeChunk[]) {
  const dates = [
    ...memories.flatMap((memory) => [memory.startDate, memory.endDate || memory.startDate]),
    ...chunks.flatMap((chunk) => [chunk.startDate, chunk.endDate])
  ].filter(Boolean);

  if (!dates.length) {
    return [];
  }

  const sortedDates = dates.sort();
  const startDate = sortedDates[0];
  const endDate = sortedDates[sortedDates.length - 1];
  return monthKeysBetween(startDate, endDate).map((key) => {
    const label = monthLabel(`${key}-01`);
    return {
      key,
      label,
      shortLabel: label.slice(0, 3),
      year: key.slice(0, 4)
    };
  });
}

function getOverviewYears(memories: MemoryItem[], chunks: LifeChunk[]) {
  const months = getOverviewMonths(memories, chunks);
  if (!months.length) {
    return [];
  }

  const startYear = Number(months[0].year);
  const endYear = Number(months[months.length - 1].year);
  const years = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    years.push({
      year,
      months: Array.from({ length: 12 }, (_, index) => {
        const key = `${year}-${String(index + 1).padStart(2, "0")}`;
        return {
          key,
          shortLabel: monthLabel(`${key}-01`).slice(0, 3)
        };
      }),
      chunks: chunks
        .filter((chunk) =>
          overlapsDateRange({ datePrecision: "range", startDate: yearStart, endDate: yearEnd } as MemoryItem, chunk)
        )
        .map((chunk) => ({
          chunk,
          startMonth: chunk.startDate.startsWith(String(year)) ? Number(chunk.startDate.slice(5, 7)) : 1,
          endMonth: chunk.endDate.startsWith(String(year)) ? Number(chunk.endDate.slice(5, 7)) : 12
        })),
      memories: memories.filter((memory) => memory.startDate.startsWith(String(year)))
    });
  }

  return years;
}

function getCalendarHeading(
  granularity: "overview" | "month" | "week",
  years: ReturnType<typeof getOverviewYears>,
  detail: { memories: MemoryItem[]; chunks: LifeChunk[] },
  filters: CalendarFilters
) {
  if (granularity === "overview") {
    return formatYearRange(years.map((year) => String(year.year))) || "No timeline data yet";
  }

  if (filters.years.length && !filters.months.length) {
    return formatYearRange(filters.years);
  }

  const dates = [
    ...detail.memories.flatMap((memory) => [memory.startDate, memory.endDate || memory.startDate]),
    ...detail.chunks.flatMap((chunk) => [chunk.startDate, chunk.endDate])
  ].filter(Boolean);

  if (!dates.length) {
    return "No matching timeline data";
  }

  const sortedDates = dates.sort();
  const startDate = sortedDates[0];
  const endDate = sortedDates[sortedDates.length - 1];

  if (filters.months.length) {
    const matchingYears = Array.from(
      new Set(
        monthKeysBetween(startDate, endDate)
          .filter((key) => filters.months.includes(key.slice(5, 7)) && (!filters.years.length || filters.years.includes(key.slice(0, 4))))
          .map((key) => key.slice(0, 4))
      )
    );
    const yearRange = formatYearRange(matchingYears);
    const monthNames = formatMonthList(filters.months);
    return yearRange ? `${monthNames} ${yearRange}` : monthNames;
  }

  const startMonth = startDate.slice(0, 7);
  const endMonth = endDate.slice(0, 7);
  if (startMonth === endMonth) {
    return monthLabel(`${startMonth}-01`);
  }

  return formatYearRange([startDate.slice(0, 4), endDate.slice(0, 4)]) || "No matching timeline data";
}

function formatYearRange(years: string[]) {
  const uniqueYears = Array.from(new Set(years.filter(Boolean))).sort();
  if (!uniqueYears.length) {
    return "";
  }

  return uniqueYears[0] === uniqueYears[uniqueYears.length - 1]
    ? uniqueYears[0]
    : `${uniqueYears[0]} - ${uniqueYears[uniqueYears.length - 1]}`;
}

function formatMonthList(months: string[]) {
  const uniqueMonths = Array.from(new Set(months)).sort();
  const names = uniqueMonths.map((month) => monthLabel(`2026-${month}-01`).replace("2026", "").trim());

  if (names.length <= 2) {
    return names.join(", ");
  }

  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function getFilterOptions(memories: MemoryItem[], chunks: LifeChunk[]) {
  const dates = [
    ...memories.flatMap((memory) => [memory.startDate, memory.endDate || memory.startDate]),
    ...chunks.flatMap((chunk) => [chunk.startDate, chunk.endDate])
  ].filter(Boolean);
  const years = Array.from(new Set(dates.map((date) => date.slice(0, 4)))).sort();
  const months = Array.from({ length: 12 }, (_, index) => {
    const key = String(index + 1).padStart(2, "0");
    return {
      value: key,
      label: monthLabel(`2026-${key}-01`).replace("2026", "").trim()
    };
  });

  return { years, months };
}

function filterTimelineDetail(memories: MemoryItem[], chunks: LifeChunk[], filters: CalendarFilters) {
  let filteredChunks = chunks;
  let filteredMemories = memories;

  if (filters.chunkId) {
    const selectedChunk = chunks.find((chunk) => chunk.id === filters.chunkId);
    if (selectedChunk) {
      filteredChunks = [selectedChunk];
      filteredMemories = filteredMemories.filter((memory) => overlapsDateRange(memory, selectedChunk));
    }
  }

  const ranges = getFilterDateRanges(filters);
  if (ranges.length) {
    filteredMemories = filteredMemories.filter((memory) => ranges.some((range) => overlapsDateRange(memory, range)));
    filteredChunks = filteredChunks.filter((chunk) =>
      ranges.some((range) => overlapsDateRange({ datePrecision: "range", startDate: range.startDate, endDate: range.endDate } as MemoryItem, chunk))
    );
  }

  if (filters.months.length && !filters.years.length) {
    filteredMemories = filteredMemories.filter((memory) =>
      filters.months.some((month) => memory.startDate.slice(5, 7) === month || memory.endDate?.slice(5, 7) === month)
    );
    filteredChunks = filteredChunks.filter((chunk) => rangeIncludesAnyMonth(chunk.startDate, chunk.endDate, filters.months));
  }

  return { memories: filteredMemories, chunks: filteredChunks };
}

function getFilterDateRanges(filters: CalendarFilters) {
  if (!filters.years.length) {
    return [];
  }

  if (filters.months.length) {
    return filters.years.flatMap((year) =>
      filters.months.map((month) => {
        const startDate = `${year}-${month}-01`;
        return { startDate, endDate: monthEndDate(`${year}-${month}`) };
      })
    );
  }

  return filters.years.map((year) => ({ startDate: `${year}-01-01`, endDate: `${year}-12-31` }));
}

function rangeIncludesMonth(startDate: string, endDate: string, month: string) {
  let current = startDate.slice(0, 7);
  const end = endDate.slice(0, 7);

  while (current <= end) {
    if (current.slice(5, 7) === month) {
      return true;
    }
    const [year, currentMonth] = current.split("-").map(Number);
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? year + 1 : year;
    current = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
  }

  return false;
}

function rangeIncludesAnyMonth(startDate: string, endDate: string, months: string[]) {
  return months.some((month) => rangeIncludesMonth(startDate, endDate, month));
}

function weekKeyForDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day || 1));
  const dayOfWeek = date.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}

function addUtcDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthEndDate(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function monthKeysBetween(startDate: string, endDate: string) {
  const [startYear, startMonth] = startDate.split("-").map(Number);
  const [endYear, endMonth] = endDate.split("-").map(Number);
  const keys: string[] = [];

  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return keys;
}

function weekKeysBetween(startDate: string, endDate: string) {
  const keys: string[] = [];
  let current = weekKeyForDate(startDate);
  const last = weekKeyForDate(endDate);

  while (current <= last) {
    keys.push(current);
    current = addUtcDays(current, 7);
  }

  return keys;
}
