import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecurrenceCadence, RecurrencePattern } from "@prisma/client";

const {
  prismaMock,
  addHistoryEventMock,
  addNotificationMock,
  broadcastToFamilyMock,
} = vi.hoisted(() => {
  const txMock = {
    bountyRecurrenceSeries: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    bountyAssignment: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  return {
    prismaMock: {
      bountyRecurrenceSeries: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb: any) => cb(txMock)),
      __tx: txMock,
    },
    addHistoryEventMock: vi.fn(),
    addNotificationMock: vi.fn(),
    broadcastToFamilyMock: vi.fn(),
  };
});

vi.mock("../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../src/services/historyService.js", () => ({
  addHistoryEvent: addHistoryEventMock,
}));

vi.mock("../src/services/notificationService.js", () => ({
  addNotification: addNotificationMock,
}));

vi.mock("../src/realtime/eventBus.js", () => ({
  broadcastToFamily: broadcastToFamilyMock,
}));

vi.mock("../src/lib/timezone.js", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/timezone.js")>(
    "../src/lib/timezone.js"
  );
  return {
    ...actual,
    getEffectiveTimezone: vi.fn(() => "UTC"),
  };
});

import {
  checkRecurringSeries,
  processPausedAutoResumeSkips,
} from "../src/services/recurrenceMonitor.js";
import { computeNextOccurrenceAfter } from "../src/lib/recurrenceSchedule.js";

function buildPausedSeries(
  cadence: RecurrenceCadence,
  autoResumeSkipAtIso: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "series-1",
    familyId: "family-1",
    bountyId: "bounty-1",
    userId: "child-1",
    active: true,
    pausedAt: new Date("2026-03-01T00:00:00.000Z"),
    autoResumeSkipAt: new Date(autoResumeSkipAtIso),
    nextOccurrenceAt: new Date(autoResumeSkipAtIso),
    currentAssignmentId: null,
    currentStreak: 12,
    streakGeneration: 3,
    family: { timezone: "UTC" },
    bounty: {
      id: "bounty-1",
      title: "Recurring task",
      emoji: "🧹",
      recurrenceEnabled: true,
      recurrenceCadence: cadence,
      recurrencePattern:
        cadence === RecurrenceCadence.MONTHLY || cadence === RecurrenceCadence.YEARLY
          ? RecurrencePattern.DAY_OF_MONTH
          : null,
      recurrenceDayOfWeek: cadence === RecurrenceCadence.WEEKLY ? 1 : null,
      recurrenceDayOfMonth:
        cadence === RecurrenceCadence.MONTHLY || cadence === RecurrenceCadence.YEARLY
          ? 10
          : null,
      recurrenceWeekOfMonth: null,
      recurrenceMonthOfYear: cadence === RecurrenceCadence.YEARLY ? 6 : null,
      rewardType: "TICKETS",
      rewardValue: "10",
    },
    user: {
      id: "child-1",
      displayName: "Kid",
      username: "kid",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  prismaMock.__tx.bountyRecurrenceSeries.update.mockResolvedValue({
    id: "series-1",
  });
  prismaMock.__tx.bountyAssignment.create.mockResolvedValue({
    id: "assignment-created",
  });
  addHistoryEventMock.mockResolvedValue(undefined);
  addNotificationMock.mockResolvedValue(undefined);
});

describe("Recurring monitor skip-one auto-resume behavior", () => {
  it("9) scheduler rollover query only processes active non-paused series", async () => {
    prismaMock.bountyRecurrenceSeries.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await checkRecurringSeries();

    const firstWhere = prismaMock.bountyRecurrenceSeries.findMany.mock.calls[0][0].where;
    const secondWhere = prismaMock.bountyRecurrenceSeries.findMany.mock.calls[1][0].where;

    expect(firstWhere.pausedAt).toEqual({ not: null });
    expect(secondWhere.pausedAt).toBeNull();
  });

  it("10) auto-resume skip updates series window without creating an assignment or mutating streak counters", async () => {
    const now = new Date("2026-03-10T00:00:00.000Z");
    const series = buildPausedSeries(RecurrenceCadence.DAILY, "2026-03-10T00:00:00.000Z");

    prismaMock.bountyRecurrenceSeries.findMany.mockResolvedValue([series]);
    prismaMock.__tx.bountyRecurrenceSeries.findUnique.mockResolvedValue(series);

    await processPausedAutoResumeSkips(now);

    const updateArgs = prismaMock.__tx.bountyRecurrenceSeries.update.mock.calls[0][0];
    const expectedNext = computeNextOccurrenceAfter(
      series.autoResumeSkipAt,
      "UTC",
      {
        cadence: series.bounty.recurrenceCadence,
        pattern: series.bounty.recurrencePattern,
        dayOfWeek: series.bounty.recurrenceDayOfWeek,
        dayOfMonth: series.bounty.recurrenceDayOfMonth,
        weekOfMonth: series.bounty.recurrenceWeekOfMonth,
        monthOfYear: series.bounty.recurrenceMonthOfYear,
      }
    );

    expect(updateArgs.data.pausedAt).toBeNull();
    expect(updateArgs.data.autoResumeSkipAt).toBeNull();
    expect((updateArgs.data.nextOccurrenceAt as Date).toISOString()).toBe(
      expectedNext.toISOString()
    );
    expect(updateArgs.data).not.toHaveProperty("currentStreak");
    expect(updateArgs.data).not.toHaveProperty("streakGeneration");
    expect(prismaMock.__tx.bountyAssignment.create).not.toHaveBeenCalled();
  });

  it.each([
    ["daily", RecurrenceCadence.DAILY, "2026-03-10T00:00:00.000Z"],
    ["weekly", RecurrenceCadence.WEEKLY, "2026-03-09T00:00:00.000Z"],
    ["monthly", RecurrenceCadence.MONTHLY, "2026-06-10T00:00:00.000Z"],
    ["yearly", RecurrenceCadence.YEARLY, "2026-06-10T00:00:00.000Z"],
  ])(
    "11) %s cadence skips exactly one occurrence before auto-resume",
    async (_label, cadence, skipBoundaryIso) => {
      const now = new Date(skipBoundaryIso);
      const series = buildPausedSeries(cadence, skipBoundaryIso);

      prismaMock.bountyRecurrenceSeries.findMany.mockResolvedValue([series]);
      prismaMock.__tx.bountyRecurrenceSeries.findUnique.mockResolvedValue(series);

      await processPausedAutoResumeSkips(now);

      const updateArgs = prismaMock.__tx.bountyRecurrenceSeries.update.mock.calls[0][0];
      const expectedNext = computeNextOccurrenceAfter(
        series.autoResumeSkipAt,
        "UTC",
        {
          cadence: series.bounty.recurrenceCadence,
          pattern: series.bounty.recurrencePattern,
          dayOfWeek: series.bounty.recurrenceDayOfWeek,
          dayOfMonth: series.bounty.recurrenceDayOfMonth,
          weekOfMonth: series.bounty.recurrenceWeekOfMonth,
          monthOfYear: series.bounty.recurrenceMonthOfYear,
        }
      );

      expect((updateArgs.data.nextOccurrenceAt as Date).toISOString()).toBe(
        expectedNext.toISOString()
      );
      expect(prismaMock.__tx.bountyAssignment.create).not.toHaveBeenCalled();
    }
  );

  it("12) paused manual mode (autoResumeSkipAt=null) is not auto-resumed by monitor", async () => {
    prismaMock.bountyRecurrenceSeries.findMany.mockResolvedValue([]);

    const now = new Date("2026-03-10T00:00:00.000Z");
    const resumed = await processPausedAutoResumeSkips(now);

    expect(resumed).toEqual([]);
    expect(prismaMock.__tx.bountyRecurrenceSeries.update).not.toHaveBeenCalled();
  });
});
