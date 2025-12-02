import { Request, Response } from "express";
import { PrizeStatus, PrizeType, Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { assertFamilyMember, assertParent, getRequestUser } from "../lib/authHelpers.js";
import { broadcastToFamily } from "../realtime/eventBus.js";
import { SseEvent } from "../types/sseEvents";
import { addHistoryEvent } from "../services/historyService.js";
import { addNotification } from "../services/notificationService.js";

// --- reward templates ----------------------------------------

export const getFamilyRewards = async (req: Request, res: Response) => {
  const { familyId } = req.params;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }

  try {
    const user = await assertFamilyMember(req, familyId);
    if (!user) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const rewards = await prisma.reward.findMany({
      where: { familyId },
      orderBy: { createdAt: "asc" },
    });

    return res.json(rewards);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("getFamilyRewards error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

export const createReward = async (req: Request, res: Response) => {
  const { familyId } = req.params;
  const { title, emoji, description, type, themeColor } = req.body;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }
  if (!title || !emoji || !type) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    const user = await assertFamilyMember(req, familyId);
    assertParent(user);

    const reward = await prisma.reward.create({
      data: {
        familyId,
        title,
        emoji,
        description: description ?? null,
        type,
        themeColor: themeColor ?? null,
      },
    });

  const event: SseEvent = {
    type: "TEMPLATE_UPDATE",
    familyId,
    target: "REWARD_TEMPLATE",
    action: "CREATED",
    timestamp: Date.now(),
  };

  broadcastToFamily(familyId, event);

    return res.status(201).json(reward);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("createReward error:", err);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      details: err instanceof Error ? err.message : String(err),
    });
  }
};

export const updateReward = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, emoji, description, type, themeColor } = req.body;

  if (!id) {
    return res.status(400).json({ error: "MISSING_REWARD_ID" });
  }

  try {
    const existing = await prisma.reward.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const user = await assertFamilyMember(req, existing.familyId);
    assertParent(user);
    const familyId = existing.familyId;
    const updated = await prisma.reward.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        emoji: emoji ?? existing.emoji,
        description: description ?? existing.description,
        type: type ?? existing.type,
        themeColor: themeColor ?? existing.themeColor,
      },
    });

  const event: SseEvent = {
    type: "TEMPLATE_UPDATE",
    familyId,
    target: "REWARD_TEMPLATE",
    action: "UPDATED",
    timestamp: Date.now(),
  };

  broadcastToFamily(familyId, event);

    return res.json(updated);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("updateReward error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

export const deleteReward = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_REWARD_ID" });
  }

  try {
    const existing = await prisma.reward.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const user = await assertFamilyMember(req, existing.familyId);
    assertParent(user);
    const familyId = existing.familyId;
    await prisma.reward.delete({ where: { id } });

    const event: SseEvent = {
      type: "TEMPLATE_UPDATE",
      familyId,
      target: "REWARD_TEMPLATE",
      action: "DELETED",
      timestamp: Date.now(),
    };

    broadcastToFamily(familyId, event);

    return res.status(204).send();
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("deleteReward error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// --- assigned prizes -----------------------------------------

export const getFamilyAssignedPrizes = async (req: Request, res: Response) => {
  const { familyId } = req.params;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }

  try {
    const user = await assertFamilyMember(req, familyId);
    if (!user) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const assignments = await prisma.assignedPrize.findMany({
      where: { familyId },
      orderBy: { assignedAt: "desc" },
    });

    return res.json(assignments);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("getFamilyAssignedPrizes error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// POST /families/:familyId/assigned-prizes
export const assignPrize = async (req: Request, res: Response) => {
  const { familyId } = req.params;
  const { templateId, userId } = req.body;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }
  if (!templateId || !userId) {
    console.error("assignPrize missing fields", { templateId, userId });
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    // Ensure caller is a parent in the same family
    const parent = await assertFamilyMember(req, familyId);
    assertParent(parent);

    // Fetch reward template
    const template = await prisma.reward.findUnique({
      where: { id: templateId },
    });

    if (!template || template.familyId !== familyId) {
      return res.status(404).json({ error: "TEMPLATE_NOT_FOUND" });
    }

    // Fetch child
    const child = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!child || child.familyId !== familyId) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    const parentName = parent.displayName || parent.username || "Parent";
    const childName = child.displayName || child.username || "Child";
    const emoji = template.emoji || "🎁";

    // One atomic unit: assignment + history + notification
    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.assignedPrize.create({
        data: {
          familyId,
          templateId,
          userId,
          assignedBy: parentName,
          status: PrizeStatus.AVAILABLE,
          assignedAt: new Date(),
          title: template.title,
          emoji,
          description: template.description ?? null,
          type: template.type as PrizeType,
          themeColor: template.themeColor ?? null,
        },
      });

      await addHistoryEvent(
        {
          familyId,
          userId: child.id,
          userName: childName,
          title: template.title,
          emoji,
          action: "ASSIGNED_REWARD",
          assignerName: parentName,
        },
        tx
      );

      await addNotification(
        {
          userId: child.id,
          message: `${parentName} gave you a new reward: ${template.title}`,
        },
        tx
      );

      return created;
    });

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId,
      reason: "REWARD_ASSIGNED",
      timestamp: Date.now(),
    };

    broadcastToFamily(familyId, event);

    return res.status(201).json(assignment);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("assignPrize error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

export const claimAssignedPrize = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const assignment = await prisma.assignedPrize.findUnique({
      where: { id },
    });

    if (!assignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const user = await assertFamilyMember(req, assignment.familyId);

    // Only the assigned child can claim
    if (user.id !== assignment.userId) {
      return res
        .status(403)
        .json({ error: "ONLY_ASSIGNEE_CAN_CLAIM" });
    }

    if (assignment.status !== PrizeStatus.AVAILABLE) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    const updated = await prisma.assignedPrize.update({
      where: { id },
      data: {
        status: PrizeStatus.PENDING_APPROVAL,
        claimedAt: new Date(),
      },
    });

    const childName =
      user.displayName || user.username || "Child";
    const title = assignment.title || "Reward";
    const emoji = assignment.emoji || "🎁";

    // History: child claimed reward (pending approval)
    await addHistoryEvent({
      familyId: assignment.familyId,
      userId: assignment.userId,
      userName: childName,
      emoji,
      title,
      action: "REWARD_CLAIMED",
      // actor = child
      assignerName: childName,
    });

    // Notify all parents in the family
    const parents = await prisma.user.findMany({
      where: { familyId: assignment.familyId, role: "PARENT" },
    });

    await Promise.all(
      parents.map((p) =>
        addNotification({
          userId: p.id,
          message: `${childName} wants to claim their reward: ${title}`,
        })
      )
    );

    // SSE: broadcast child action to admin dashboard(s)
    const event: SseEvent = {
      type: "CHILD_ACTION",
      subtype: "REWARD_CLAIMED",
      id,
      userId: user.id,
      timestamp: Date.now(),
    };

    broadcastToFamily(user.familyId, event);

    return res.json(updated);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("claimAssignedPrize error:", err);
    return res
      .status(500)
      .json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

export const approveAssignedPrize = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const assignment = await prisma.assignedPrize.findUnique({
      where: { id },
    });

    if (!assignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const parent = await assertFamilyMember(req, assignment.familyId);
    assertParent(parent);

    if (assignment.status !== PrizeStatus.PENDING_APPROVAL) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    const updated = await prisma.assignedPrize.update({
      where: { id },
      data: {
        status: PrizeStatus.REDEEMED,
        redeemedAt: new Date(),
      },
    });

    const childName = updated.assignedBy || "Child";
    const title = assignment.title || "Reward";
    const emoji = assignment.emoji || "🎁";
    const parentName = parent.displayName || parent.username || "Parent";

    await addHistoryEvent({
      familyId: assignment.familyId,
      userId: assignment.userId,
      userName: childName,
      emoji,
      title,
      action: "REWARD_APPROVED",
      assignerName: parentName,
    });

    await addNotification({
      userId: assignment.userId,
      message: `${parentName} approved your reward: ${title}`,
    });

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId: assignment.familyId,
      reason: "REWARD_APPROVED",
      timestamp: Date.now(),
    };

    broadcastToFamily(assignment.familyId, event);

    return res.json(updated);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("approveAssignedPrize error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

export const rejectAssignedPrize = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const assignment = await prisma.assignedPrize.findUnique({
      where: { id },
    });

    if (!assignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const parent = await assertFamilyMember(req, assignment.familyId);
    assertParent(parent);

    const user = await assertFamilyMember(req, assignment.familyId);
    assertParent(user);

    if (assignment.status !== PrizeStatus.PENDING_APPROVAL) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    const updated = await prisma.assignedPrize.update({
      where: { id },
      data: {
        status: PrizeStatus.AVAILABLE,
        claimedAt: null,
      },
    });

    const childName = updated.assignedBy || "Child";
    const title = assignment.title || "Reward";
    const emoji = assignment.emoji || "❌";
    const parentName = parent.displayName || parent.username || "Parent";

    await addHistoryEvent({
      familyId: assignment.familyId,
      userId: assignment.userId,
      userName: childName,
      emoji: emoji,
      title: title,
      action: "REWARD_REJECTED",
      assignerName: parentName,
    });

    await addNotification({
      userId: assignment.userId,
      message: `${parent.displayName ?? "Parent"} rejected your reward: ${
        assignment.title ?? "Reward"
      }`,
    });
    
    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId: assignment.familyId,
      reason: "REWARD_REJECTED",
      timestamp: Date.now(),
    };

    broadcastToFamily(assignment.familyId, event);

    return res.json(updated);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("rejectAssignedPrize error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

export const deleteAssignedPrize = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const assignment = await prisma.assignedPrize.findUnique({
      where: { id },
    });

    if (!assignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const user = await assertFamilyMember(req, assignment.familyId);
    assertParent(user);

    await prisma.assignedPrize.delete({
      where: { id },
    });

    return res.status(204).send();
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("deleteAssignedPrize error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};
