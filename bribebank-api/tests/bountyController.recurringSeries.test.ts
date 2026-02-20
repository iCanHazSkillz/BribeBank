import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BountyStatus, Role } from "@prisma/client";

const {
  prismaMock,
  assertFamilyMemberMock,
  assertParentMock,
  addHistoryEventMock,
  addNotificationMock,
  sendPushToUserMock,
  broadcastToFamilyMock,
} = vi.hoisted(() => {
  const txMock = {
    bountyRecurrenceSeries: {
      update: vi.fn(),
    },
    bountyAssignment: {
      deleteMany: vi.fn(),
    },
  };

  return {
    prismaMock: {
      bountyRecurrenceSeries: {
        findUnique: vi.fn(),
      },
      bountyAssignment: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (cb: any) => cb(txMock)),
      __tx: txMock,
    },
    assertFamilyMemberMock: vi.fn(),
    assertParentMock: vi.fn((user: { role: Role }) => {
      if (user.role !== Role.PARENT) {
        throw { status: 403, error: "PARENT_ONLY" as const };
      }
    }),
    addHistoryEventMock: vi.fn(),
    addNotificationMock: vi.fn(),
    sendPushToUserMock: vi.fn(),
    broadcastToFamilyMock: vi.fn(),
  };
});

vi.mock("../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../src/lib/authHelpers.js", () => ({
  assertFamilyMember: assertFamilyMemberMock,
  assertParent: assertParentMock,
  getRequestUser: vi.fn(),
}));

vi.mock("../src/services/historyService.js", () => ({
  addHistoryEvent: addHistoryEventMock,
}));

vi.mock("../src/services/notificationService.js", () => ({
  addNotification: addNotificationMock,
}));

vi.mock("../src/services/pushService.js", () => ({
  sendPushToUser: sendPushToUserMock,
}));

vi.mock("../src/realtime/eventBus.js", () => ({
  broadcastToFamily: broadcastToFamilyMock,
}));

import {
  cancelAssignedBounty,
  getFamilyBountyAssignments,
  pauseBountySeries,
  resumeBountySeries,
  stopBountySeries,
} from "../src/controllers/bountyController.js";

type MockReq = {
  params: Record<string, string>;
  body?: Record<string, unknown>;
  userId?: string;
};

function mockReq(
  params: Record<string, string>,
  body: Record<string, unknown> = {},
  userId = "parent-1"
): MockReq {
  return { params, body, userId };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

function buildSeries(overrides: Record<string, unknown> = {}) {
  return {
    id: "series-1",
    familyId: "family-1",
    bountyId: "bounty-1",
    userId: "child-1",
    active: true,
    pausedAt: null,
    autoResumeSkipAt: null,
    nextOccurrenceAt: new Date("2026-03-10T00:00:00.000Z"),
    currentAssignmentId: "assignment-1",
    bounty: {
      title: "Daily task",
      emoji: "🧹",
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
  prismaMock.__tx.bountyAssignment.deleteMany.mockResolvedValue({ count: 1 });
  addHistoryEventMock.mockResolvedValue(undefined);
  addNotificationMock.mockResolvedValue(undefined);
  sendPushToUserMock.mockResolvedValue(undefined);

  assertFamilyMemberMock.mockResolvedValue({
    id: "parent-1",
    familyId: "family-1",
    role: Role.PARENT,
    displayName: "Parent",
    username: "parent",
  });
  assertParentMock.mockImplementation((user: { role: Role }) => {
    if (user.role !== Role.PARENT) {
      throw { status: 403, error: "PARENT_ONLY" as const };
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Recurring series controller semantics", () => {
  it("1) parent can pause an active series at any time and default is skip-next auto-resume", async () => {
    const series = buildSeries();
    prismaMock.bountyRecurrenceSeries.findUnique.mockResolvedValue(series);

    const req = mockReq({ seriesId: series.id });
    const res = mockRes();

    await pauseBountySeries(req as any, res as any);

    expect(res.status).not.toHaveBeenCalled();
    expect(prismaMock.__tx.bountyRecurrenceSeries.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: series.id },
        data: expect.objectContaining({
          autoResumeSkipAt: series.nextOccurrenceAt,
        }),
      })
    );
  });

  it("2) pause with autoResumeSkipNext=false leaves series paused until manual resume", async () => {
    const series = buildSeries();
    prismaMock.bountyRecurrenceSeries.findUnique.mockResolvedValue(series);

    const req = mockReq(
      { seriesId: series.id },
      { autoResumeSkipNext: false }
    );
    const res = mockRes();

    await pauseBountySeries(req as any, res as any);

    expect(prismaMock.__tx.bountyRecurrenceSeries.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          autoResumeSkipAt: null,
        }),
      })
    );
  });

  it("3) pause does not mutate current assignment state/rewards (series-only mutation)", async () => {
    const series = buildSeries();
    prismaMock.bountyRecurrenceSeries.findUnique.mockResolvedValue(series);

    const req = mockReq({ seriesId: series.id });
    const res = mockRes();

    await pauseBountySeries(req as any, res as any);

    expect(prismaMock.__tx.bountyAssignment.deleteMany).not.toHaveBeenCalled();
  });

  it("4) manual resume clears skip metadata and shifts nextOccurrenceAt by pause duration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T00:00:00.000Z"));

    const series = buildSeries({
      pausedAt: new Date("2026-03-18T00:00:00.000Z"),
      autoResumeSkipAt: new Date("2026-03-12T00:00:00.000Z"),
      nextOccurrenceAt: new Date("2026-03-21T00:00:00.000Z"),
    });
    prismaMock.bountyRecurrenceSeries.findUnique.mockResolvedValue(series);

    const req = mockReq({ seriesId: series.id });
    const res = mockRes();

    await resumeBountySeries(req as any, res as any);

    const updateCall = prismaMock.__tx.bountyRecurrenceSeries.update.mock.calls[0][0];
    const shifted = updateCall.data.nextOccurrenceAt as Date;

    expect(updateCall.data.autoResumeSkipAt).toBeNull();
    expect(shifted.toISOString()).toBe("2026-03-23T00:00:00.000Z");
  });

  it("5) stop endpoint is parent-allowed for active series and deactivates future recurrence", async () => {
    const series = buildSeries();
    prismaMock.bountyRecurrenceSeries.findUnique.mockResolvedValue(series);

    const req = mockReq({ seriesId: series.id });
    const res = mockRes();

    await stopBountySeries(req as any, res as any);

    expect(prismaMock.__tx.bountyAssignment.deleteMany).toHaveBeenCalledWith({
      where: { id: series.currentAssignmentId },
    });
    expect(prismaMock.__tx.bountyRecurrenceSeries.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          active: false,
          pausedAt: null,
          autoResumeSkipAt: null,
          currentAssignmentId: null,
        }),
      })
    );
  });

  it("6) child cannot call pause/resume/stop endpoints (parent-only)", async () => {
    const series = buildSeries();
    prismaMock.bountyRecurrenceSeries.findUnique.mockResolvedValue(series);
    assertFamilyMemberMock.mockResolvedValue({
      id: "child-1",
      familyId: "family-1",
      role: Role.CHILD,
      displayName: "Kid",
      username: "kid",
    });

    const pauseRes = mockRes();
    await pauseBountySeries(
      mockReq({ seriesId: series.id }, {}, "child-1") as any,
      pauseRes as any
    );
    expect(pauseRes.status).toHaveBeenCalledWith(403);

    const resumeRes = mockRes();
    await resumeBountySeries(
      mockReq({ seriesId: series.id }, {}, "child-1") as any,
      resumeRes as any
    );
    expect(resumeRes.status).toHaveBeenCalledWith(403);

    const stopRes = mockRes();
    await stopBountySeries(
      mockReq({ seriesId: series.id }, {}, "child-1") as any,
      stopRes as any
    );
    expect(stopRes.status).toHaveBeenCalledWith(403);
  });

  it("7) occurrence-level cancel remains blocked for VERIFIED tasks", async () => {
    prismaMock.bountyAssignment.findUnique.mockResolvedValue({
      id: "assignment-verified",
      familyId: "family-1",
      userId: "child-1",
      bountyId: "bounty-1",
      recurrenceSeriesId: "series-1",
      status: BountyStatus.VERIFIED,
      recurrenceSeries: { pausedAt: null },
      bounty: { id: "bounty-1", title: "Task", emoji: "🧹", rewardType: "TICKETS", rewardValue: "10" },
      user: { id: "child-1", displayName: "Kid", username: "kid" },
    });

    const req = {
      params: { id: "assignment-verified" },
      userId: "parent-1",
    };
    const res = mockRes();

    await cancelAssignedBounty(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "CANNOT_CANCEL_VERIFIED_TASK" });
  });

  it("8) bounty assignment payload exposes series control fields used by manage feed", async () => {
    prismaMock.bountyAssignment.findUnique.mockReset();
    prismaMock.user.findUnique.mockResolvedValue({ displayName: "Parent" });

    prismaMock.bountyAssignment.findMany = vi.fn().mockResolvedValue([
      {
        id: "assignment-1",
        familyId: "family-1",
        bountyId: "bounty-1",
        userId: "child-1",
        assignedBy: "parent-1",
        assignedAt: new Date("2026-03-01T00:00:00.000Z"),
        status: BountyStatus.VERIFIED,
        completedAt: new Date("2026-03-01T01:00:00.000Z"),
        denialReason: null,
        denialNotes: null,
        deniedAt: null,
        deadlineStartedAt: null,
        deadlineExpiresAt: null,
        photoUrl: null,
        recurrenceSeriesId: "series-1",
        bounty: {
          id: "bounty-1",
          streakEnabled: true,
          recurrenceEnabled: true,
        },
        recurrenceSeries: {
          id: "series-1",
          active: true,
          pausedAt: new Date("2026-03-02T00:00:00.000Z"),
          autoResumeSkipAt: new Date("2026-03-03T00:00:00.000Z"),
          currentStreak: 5,
          nextOccurrenceAt: new Date("2026-03-04T00:00:00.000Z"),
          currentAssignmentId: "assignment-1",
        },
        user: { id: "child-1", displayName: "Kid", role: Role.CHILD },
      },
    ]);

    const req = { params: { familyId: "family-1" }, userId: "parent-1" };
    const res = mockRes();

    await getFamilyBountyAssignments(req as any, res as any);

    const payload = res.json.mock.calls[0][0][0];
    expect(payload.seriesActive).toBe(true);
    expect(payload.seriesPaused).toBe(true);
    expect(payload.seriesAutoResumeSkipAt).toBeInstanceOf(Date);
    expect(payload.isCurrentOccurrence).toBe(true);
    expect(payload.nextOccurrenceAt).toBeInstanceOf(Date);
  });
});
