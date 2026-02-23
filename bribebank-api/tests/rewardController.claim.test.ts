import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrizeStatus, Role } from "@prisma/client";

const {
  prismaMock,
  assertFamilyMemberMock,
  addHistoryEventMock,
  addNotificationMock,
  sendPushToUserMock,
  broadcastToFamilyMock,
} = vi.hoisted(() => ({
  prismaMock: {
    assignedPrize: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
  assertFamilyMemberMock: vi.fn(),
  addHistoryEventMock: vi.fn(),
  addNotificationMock: vi.fn(),
  sendPushToUserMock: vi.fn(),
  broadcastToFamilyMock: vi.fn(),
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../src/lib/authHelpers.js", () => ({
  assertFamilyMember: assertFamilyMemberMock,
  assertParent: vi.fn(),
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

import { claimAssignedPrize } from "../src/controllers/rewardController.js";

type MockReq = {
  params: Record<string, string>;
  userId?: string;
};

function mockReq(params: Record<string, string>, userId = "child-1"): MockReq {
  return { params, userId };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const baseAssignment = {
  id: "assignment-1",
  familyId: "family-1",
  userId: "child-1",
  status: PrizeStatus.AVAILABLE,
  title: "Small bubble tea",
  emoji: "🎁",
  templateId: "reward-template-1",
  assignedBy: "Mom",
};

beforeEach(() => {
  vi.clearAllMocks();

  assertFamilyMemberMock.mockResolvedValue({
    id: "child-1",
    role: Role.CHILD,
    familyId: "family-1",
    displayName: "Jasmine",
    username: "jasmine",
  });
  addHistoryEventMock.mockResolvedValue(undefined);
  addNotificationMock.mockResolvedValue(undefined);
  sendPushToUserMock.mockResolvedValue(undefined);
  prismaMock.user.findMany.mockResolvedValue([
    { id: "parent-1" },
    { id: "parent-2" },
  ]);
});

describe("claimAssignedPrize", () => {
  it("transitions AVAILABLE -> PENDING_APPROVAL once and emits one set of side effects", async () => {
    const updatedAssignment = {
      ...baseAssignment,
      status: PrizeStatus.PENDING_APPROVAL,
      claimedAt: new Date("2026-02-23T20:38:47.000Z"),
    };

    prismaMock.assignedPrize.findUnique
      .mockResolvedValueOnce(baseAssignment)
      .mockResolvedValueOnce(updatedAssignment);
    prismaMock.assignedPrize.updateMany.mockResolvedValue({ count: 1 });

    const req = mockReq({ id: baseAssignment.id });
    const res = mockRes();

    await claimAssignedPrize(req as any, res as any);

    expect(prismaMock.assignedPrize.updateMany).toHaveBeenCalledWith({
      where: {
        id: baseAssignment.id,
        status: PrizeStatus.AVAILABLE,
      },
      data: {
        status: PrizeStatus.PENDING_APPROVAL,
        claimedAt: expect.any(Date),
      },
    });
    expect(addHistoryEventMock).toHaveBeenCalledTimes(1);
    expect(addNotificationMock).toHaveBeenCalledTimes(2);
    expect(sendPushToUserMock).toHaveBeenCalledTimes(2);
    expect(broadcastToFamilyMock).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(updatedAssignment);
  });

  it("returns INVALID_STATUS without side effects when transition fails (duplicate/concurrent claim)", async () => {
    prismaMock.assignedPrize.findUnique.mockResolvedValue(baseAssignment);
    prismaMock.assignedPrize.updateMany.mockResolvedValue({ count: 0 });

    const req = mockReq({ id: baseAssignment.id });
    const res = mockRes();

    await claimAssignedPrize(req as any, res as any);

    expect(prismaMock.assignedPrize.findUnique).toHaveBeenCalledTimes(1);
    expect(addHistoryEventMock).not.toHaveBeenCalled();
    expect(addNotificationMock).not.toHaveBeenCalled();
    expect(sendPushToUserMock).not.toHaveBeenCalled();
    expect(broadcastToFamilyMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "INVALID_STATUS" });
  });
});
