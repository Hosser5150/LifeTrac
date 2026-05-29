import { describe, expect, it } from "vitest";
import type { GoogleCalendarSummary } from "../shared/types";
import { normalizeGoogleCalendarEvent } from "../server/googleCalendar";

const calendar: GoogleCalendarSummary = {
  id: "primary",
  summary: "Personal",
  color: "#4777f5",
  timeZone: "America/Toronto",
  primary: true,
  selected: true,
  accessRole: "owner"
};

describe("Google Calendar normalization", () => {
  it("normalizes read-only timed events for the calendar hub", () => {
    const event = normalizeGoogleCalendarEvent(calendar, {
      id: "timed-1",
      summary: "Review",
      recurringEventId: "series-1",
      start: { dateTime: "2026-05-22T09:00:00-04:00" },
      end: { dateTime: "2026-05-22T09:30:00-04:00" }
    });

    expect(event).toMatchObject({
      externalId: "timed-1",
      calendarSummary: "Personal",
      allDay: false,
      recurring: true,
      title: "Review"
    });
  });

  it("keeps all-day bounds and drops cancelled events", () => {
    const allDay = normalizeGoogleCalendarEvent(calendar, {
      id: "day-1",
      start: { date: "2026-05-22" },
      end: { date: "2026-05-23" }
    });
    const cancelled = normalizeGoogleCalendarEvent(calendar, {
      id: "gone",
      status: "cancelled",
      start: { date: "2026-05-22" },
      end: { date: "2026-05-23" }
    });

    expect(allDay?.allDay).toBe(true);
    expect(allDay?.title).toBe("Untitled event");
    expect(cancelled).toBeNull();
  });
});
