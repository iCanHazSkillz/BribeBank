import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrizeStatus, Role } from "@prisma/client";

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
    assignedPrize: {
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    storeItem: {
      findFirst: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
  };

  return {
    prismaMock: {
      assignedPrize: {
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
      storeItem: {
        findFirst: vi.fn(),
      },
      user: {
        update: vi.fn(),
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
  approveAssignedPrize,
  cancelClaimedPrize,
  rejectAssignedPrize,
} from "../src/controllers/rewardController.js";

type MockReq = {
  params: Record<string, string>;
  userId?: string;
};

function mockReq(params: Record<string, string>, userId = "parent-1"): MockReq {
  return { params, userId };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

const pendingAssignment = {
  id: "assignment-1",
  familyId: "family-1",
  userId: "child-1",
  status: PrizeStatus.PENDING_APPROVAL,
  title: "Small bubble tea",
  emoji: "🎁",
  templateId: "reward-template-1",
  assignedBy: "Jasmine",
};

beforeEach(() => {
  vi.clearAllMocks();
  addHistoryEventMock.mockResolvedValue(undefined);
  addNotificationMock.mockResolvedValue(undefined);
  sendPushToUserMock.mockResolvedValue(undefined);
});

describe("Reward lifecycle transition guards", () => {
  it("approveAssignedPrize returns INVALID_STATUS with no side effects when transition was already consumed", async () => {
    prismaMock.assignedPrize.findUnique.mockResolvedValue(pendingAssignment);
    prismaMock.assignedPrize.updateMany.mockResolvedValue({ count: 0 });
    assertFamilyMemberMock.mockResolvedValue({
      id: "parent-1",
      familyId: "family-1",
      role: Role.PARENT,
      displayName: "Mom",
      username: "mom",
    });

    const req = mockReq({ id: pendingAssignment.id });
    const res = mockRes();

    await approveAssignedPrize(req as any, res as any);

    expect(prismaMock.assignedPrize.updateMany).toHaveBeenCalledWith({
      where: {
        id: pendingAssignment.id,
        status: PrizeStatus.PENDING_APPROVAL,
      },
      data: {
        status: PrizeStatus.REDEEMED,
        redeemedAt: expect.any(Date),
      },
    });
    expect(addHistoryEventMock).not.toHaveBeenCalled();
    expect(addNotificationMock).not.toHaveBeenCalled();
    expect(sendPushToUserMock).not.toHaveBeenCalled();
    expect(broadcastToFamilyMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "INVALID_STATUS" });
  });

  it("rejectAssignedPrize returns INVALID_STATUS with no side effects when transition was already consumed", async () => {
    prismaMock.assignedPrize.findUnique.mockResolvedValue(pendingAssignment);
    prismaMock.assignedPrize.updateMany.mockResolvedValue({ count: 0 });
    assertFamilyMemberMock.mockResolvedValue({
      id: "parent-1",
      familyId: "family-1",
      role: Role.PARENT,
      displayName: "Mom",
      username: "mom",
    });

    const req = mockReq({ id: pendingAssignment.id });
    const res = mockRes();

    await rejectAssignedPrize(req as any, res as any);

    expect(prismaMock.assignedPrize.updateMany).toHaveBeenCalledWith({
      where: {
        id: pendingAssignment.id,
        status: PrizeStatus.PENDING_APPROVAL,
      },
      data: {
        status: PrizeStatus.AVAILABLE,
        claimedAt: null,
      },
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(addHistoryEventMock).not.toHaveBeenCalled();
    expect(addNotificationMock).not.toHaveBeenCalled();
    expect(sendPushToUserMock).not.toHaveBeenCalled();
    expect(broadcastToFamilyMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "INVALID_STATUS" });
  });

  it("cancelClaimedPrize returns INVALID_STATUS with no side effects when transition was already consumed", async () => {
    prismaMock.assignedPrize.findUnique.mockResolvedValue(pendingAssignment);
    prismaMock.__tx.assignedPrize.updateMany.mockResolvedValue({ count: 0 });
    assertFamilyMemberMock.mockResolvedValue({
      id: "child-1",
      familyId: "family-1",
      role: Role.CHILD,
      displayName: "Jasmine",
      username: "jasmine",
    });

    const req = mockReq({ id: pendingAssignment.id }, "child-1");
    const res = mockRes();

    await cancelClaimedPrize(req as any, res as any);

    expect(prismaMock.__tx.assignedPrize.updateMany).toHaveBeenCalledWith({
      where: {
        id: pendingAssignment.id,
        status: PrizeStatus.PENDING_APPROVAL,
      },
      data: {
        status: PrizeStatus.AVAILABLE,
        claimedAt: null,
      },
    });
    expect(addHistoryEventMock).not.toHaveBeenCalled();
    expect(broadcastToFamilyMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "INVALID_STATUS" });
  });
});
