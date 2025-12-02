import { Request, Response } from "express";
import { BountyStatus, Role, PrizeStatus, PrizeType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { assertFamilyMember, assertParent, getRequestUser } from "../lib/authHelpers.js";
import { broadcastToFamily } from "../realtime/eventBus.js";
import { SseEvent } from "../types/sseEvents";
import { addHistoryEvent } from "../services/historyService.js";
import { addNotification } from "../services/notificationService.js";

/**
 * GET /families/:familyId/bounties
 * List all bounty templates for a family
 */
export const getFamilyBounties = async (req: Request, res: Response) => {
  const { familyId } = req.params;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }

  try {
    // Ensure caller is in the family
    await assertFamilyMember(req, familyId);

    const bounties = await prisma.bounty.findMany({
      where: { familyId },
      orderBy: { createdAt: "asc" },
    });

    return res.json(bounties);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("getFamilyBounties error:", err);
    return res
      .status(500)
      .json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * POST /families/:familyId/bounties
 * Create a new bounty template
 */
export const createBounty = async (req: Request, res: Response) => {
  const { familyId } = req.params;
  const { title, emoji, rewardValue, isFCFS, rewardTemplateId, themeColor } = req.body;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }
  if (!title || !emoji || !rewardValue) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    const user = await assertFamilyMember(req, familyId);
    assertParent(user);

    const bounty = await prisma.bounty.create({
      data: {
        familyId,
        title,
        emoji,
        rewardValue,
        isFCFS: !!isFCFS,
        rewardTemplateId: rewardTemplateId ?? null,
        themeColor: themeColor ?? null,
      },
    });

    const event: SseEvent = {
      type: "TEMPLATE_UPDATE",
      familyId,
      target: "BOUNTY_TEMPLATE",
      action: "CREATED",
      timestamp: Date.now(),
    };

    broadcastToFamily(familyId, event);

    return res.status(201).json(bounty);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("createBounty error:", err);
    return res
      .status(500)
      .json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * PUT /bounties/:id
 * Update an existing bounty template
 */
export const updateBounty = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, emoji, rewardValue, isFCFS, rewardTemplateId, themeColor } = req.body;

  if (!id) {
    return res.status(400).json({ error: "MISSING_BOUNTY_ID" });
  }

  try {
    const existing = await prisma.bounty.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const user = await assertFamilyMember(req, existing.familyId);
    assertParent(user);
    const familyId = existing.familyId;
    const updated = await prisma.bounty.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        emoji: emoji ?? existing.emoji,
        rewardValue: rewardValue ?? existing.rewardValue,
        isFCFS:
          typeof isFCFS === "boolean" ? isFCFS : existing.isFCFS,
        rewardTemplateId:
          rewardTemplateId !== undefined
            ? rewardTemplateId
            : existing.rewardTemplateId,
        themeColor: themeColor ?? undefined,
      },
    });

    const event: SseEvent = {
      type: "TEMPLATE_UPDATE",
      familyId,
      target: "BOUNTY_TEMPLATE",
      action: "UPDATED",
      timestamp: Date.now(),
    };

    broadcastToFamily(familyId, event);

    return res.json(updated);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("updateBounty error:", err);
    return res
      .status(500)
      .json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * DELETE /bounties/:id
 * Delete a bounty template (and its assignments)
 */
export const deleteBounty = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_BOUNTY_ID" });
  }

  try {
    const existing = await prisma.bounty.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const user = await assertFamilyMember(req, existing.familyId);
    assertParent(user);
    const familyId = existing.familyId;
    // Remove assignments first (to avoid FK issues)
    await prisma.bountyAssignment.deleteMany({
      where: { bountyId: id },
    });

    await prisma.bounty.delete({ where: { id } });

    const event: SseEvent = {
      type: "TEMPLATE_UPDATE",
      familyId,
      target: "BOUNTY_TEMPLATE",
      action: "DELETED",
      timestamp: Date.now(),
    };

    broadcastToFamily(familyId, event);

    return res.status(204).send();
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("deleteBounty error:", err);
    return res
      .status(500)
      .json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * GET /families/:familyId/bounty-assignments
 * List all bounty assignments for a family
 */
export const getFamilyBountyAssignments = async (
  req: Request,
  res: Response
) => {
  const { familyId } = req.params;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }

  try {
    await assertFamilyMember(req, familyId);

    const assignments = await prisma.bountyAssignment.findMany({
      where: { familyId },
      orderBy: { assignedAt: "desc" },
      include: {
        bounty: true,
        user: {
          select: {
            id: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    return res.json(assignments);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("getFamilyBountyAssignments error:", err);
    return res
      .status(500)
      .json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * POST /families/:familyId/bounty-assignments
 * Assign a bounty to a child
 */
export const assignBounty = async (req: Request, res: Response) => {
  const { familyId } = req.params;
  const { bountyId, userId } = req.body;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }
  if (!bountyId || !userId) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    const parent = await assertFamilyMember(req, familyId);
    assertParent(parent);

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
    });

    if (!bounty || bounty.familyId !== familyId) {
      return res.status(404).json({ error: "BOUNTY_NOT_FOUND" });
    }

    const child = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!child || child.familyId !== familyId) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    const parentName = parent.displayName || parent.username || "Parent";
    const childName = child.displayName || child.username || "Child";
    const emoji = bounty.emoji || "🧹";

    // Assignment + history + notification as one atomic unit
    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.bountyAssignment.create({
        data: {
          familyId,
          bountyId,
          userId,
          assignedBy: parentName,
          status: BountyStatus.OFFERED,
        },
        include: {
          bounty: true,
          user: {
            select: { id: true, displayName: true, role: true },
          },
        },
      });

      await addHistoryEvent(
        {
          familyId,
          userId: child.id,
          userName: childName,
          title: bounty.title,
          emoji,
          action: "ASSIGNED_TASK",
          assignerName: parentName,
        },
        tx
      );

      await addNotification(
        {
          userId: child.id,
          message: `${parentName} assigned you a new task: ${bounty.title}`,
        },
        tx
      );

      return created;
    });

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId,
      reason: "TASK_ASSIGNED",
      timestamp: Date.now(),
    };

    broadcastToFamily(familyId, event);

    return res.status(201).json(assignment);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("assignBounty error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};


// POST /bounty-assignments/:id/accept
export const acceptAssignedBounty = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const assignment = await prisma.bountyAssignment.findUnique({
      where: { id },
    });

    if (!assignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    // Only the assigned child can accept
    const user = await assertFamilyMember(req, assignment.familyId);
    if (user.id !== assignment.userId) {
      return res.status(403).json({ error: "ONLY_ASSIGNEE_CAN_ACCEPT" });
    }

    if (assignment.status !== BountyStatus.OFFERED) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    // Load bounty for details
    const bounty = await prisma.bounty.findUnique({
      where: { id: assignment.bountyId },
    });

    if (!bounty) {
      return res.status(404).json({ error: "BOUNTY_NOT_FOUND" });
    }

    const updated = await prisma.bountyAssignment.update({
      where: { id },
      data: {
        status: BountyStatus.IN_PROGRESS,
      },
    });

    // FIRST COME FIRST SERVED: remove other OFFERED assignments
    if (bounty.isFCFS) {
      await prisma.bountyAssignment.deleteMany({
        where: {
          bountyId: assignment.bountyId,
          familyId: assignment.familyId,
          status: BountyStatus.OFFERED,
          NOT: { id: assignment.id },
        },
      });
    }

    const childName = user.displayName || user.username || "Child";
    const emoji = bounty.emoji || "🧹";

    // History: child accepted the task
    await addHistoryEvent({
      familyId: assignment.familyId,
      userId: assignment.userId,
      userName: childName,
      title: bounty.title,
      emoji,
      action: "ACCEPTED_TASK",
      assignerName: childName, // actor is the child
    });

    // Notify all parents
    const parents = await prisma.user.findMany({
      where: { familyId: assignment.familyId, role: "PARENT" },
    });

    await Promise.all(
      parents.map((parent) =>
        addNotification({
          userId: parent.id,
          message: `${childName} accepted task: ${bounty.title}`,
        })
      )
    );

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId: assignment.familyId,
      reason: "TASK_ACCEPTED",
      timestamp: Date.now(),
    };

    broadcastToFamily(assignment.familyId, event);

    return res.json(updated);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("acceptAssignedBounty error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// POST /bounty-assignments/:id/complete
export const completeAssignedBounty = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const assignment = await prisma.bountyAssignment.findUnique({
      where: { id },
      include: {
        bounty: true,
        user: true,
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const bounty = assignment.bounty;
    const child = assignment.user;

    if (!bounty || !child) {
      return res.status(500).json({ error: "BOUNTY_OR_CHILD_MISSING" });
    }

    // Only the assigned child can complete
    const user = await assertFamilyMember(req, assignment.familyId);
    if (user.id !== assignment.userId) {
      return res.status(403).json({ error: "ONLY_ASSIGNEE_CAN_COMPLETE" });
    }

    if (assignment.status !== BountyStatus.IN_PROGRESS) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    const updated = await prisma.bountyAssignment.update({
      where: { id },
      data: {
        status: BountyStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    const childName = child.displayName || child.username || "Child";
    const emoji = bounty.emoji || "🧹";

    // History: child marked task complete (pending verification)
    await addHistoryEvent({
      familyId: assignment.familyId,
      userId: assignment.userId,
      userName: childName,
      title: bounty.title,
      emoji,
      action: "COMPLETED_TASK",
      assignerName: childName, // actor is the child
    });

    // Notify all parents that verification is needed
    const parents = await prisma.user.findMany({
      where: { familyId: assignment.familyId, role: "PARENT" },
    });

    await Promise.all(
      parents.map((parent) =>
        addNotification({
          userId: parent.id,
          message: `${childName} marked task "${bounty.title}" as complete. Waiting for verification.`,
        })
      )
    );

    // Broadcast to admin dashboards (child action)
    const event: SseEvent = {
      type: "CHILD_ACTION",
      subtype: "TASK_COMPLETED",
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

    console.error("completeAssignedBounty error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// POST /bounty-assignments/:id/verify
export const verifyAssignedBounty = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const existingAssignment = await prisma.bountyAssignment.findUnique({
      where: { id },
      include: {
        bounty: true,
        user: true,
      },
    });

    if (!existingAssignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const bounty = existingAssignment.bounty;
    const child = existingAssignment.user;

    if (!bounty || !child) {
      return res.status(500).json({ error: "BOUNTY_OR_CHILD_MISSING" });
    }

    const parent = await assertFamilyMember(req, existingAssignment.familyId);
    assertParent(parent);

    if (existingAssignment.status !== BountyStatus.COMPLETED) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    // 1) Mark bounty assignment VERIFIED
    const updatedAssignment = await prisma.bountyAssignment.update({
      where: { id },
      data: {
        status: BountyStatus.VERIFIED,
        completedAt: existingAssignment.completedAt ?? new Date(),
      },
    });

    // 2) Build snapshot fields for reward
    let templateId: string | null = null;
    let snapshotTitle: string;
    let snapshotEmoji: string;
    let snapshotDescription: string | null;
    let snapshotType: PrizeType;
    let snapshotThemeColor: string | null;

    if (bounty.rewardTemplateId) {
      const template = await prisma.reward.findUnique({
        where: { id: bounty.rewardTemplateId },
      });

      if (template) {
        templateId = template.id;
        snapshotTitle = template.title;
        snapshotEmoji = template.emoji;
        snapshotDescription = template.description ?? null;
        snapshotType = template.type;
        snapshotThemeColor = template.themeColor ?? null;
      } else {
        // fallback when template reference is stale
        snapshotTitle = bounty.rewardValue;
        snapshotEmoji = "💵";
        snapshotDescription = `Reward for completing: ${bounty.title}`;
        snapshotType = PrizeType.PRIVILEGE;
        snapshotThemeColor = "#22c55e";
      }
    } else {
      // Bounty-based reward only
      snapshotTitle = bounty.rewardValue;
      snapshotEmoji = "💵";
      snapshotDescription = `Reward for completing: ${bounty.title}`;
      snapshotType = PrizeType.PRIVILEGE;
      snapshotThemeColor = "#22c55e";
    }

    const parentName = parent.displayName || parent.username || "Parent";
    const childName = child.displayName || child.username || "Child";

    // 3) Transaction: create prize, log history, notify child
    const createdPrize = await prisma.$transaction(async (tx) => {
      const prize = await tx.assignedPrize.create({
        data: {
          familyId: existingAssignment.familyId,
          templateId,
          userId: existingAssignment.userId,
          assignedBy: parentName,
          status: PrizeStatus.AVAILABLE,
          assignedAt: new Date(),
          title: snapshotTitle,
          emoji: snapshotEmoji,
          description: snapshotDescription,
          type: snapshotType,
          themeColor: snapshotThemeColor,
        },
      });

      await addHistoryEvent(
        {
          familyId: existingAssignment.familyId,
          userId: existingAssignment.userId,
          userName: childName,
          title: bounty.title,
          emoji: bounty.emoji || "🧹",
          action: "VERIFIED_TASK",
          assignerName: parentName,
        },
        tx
      );

      await addNotification(
        {
          userId: existingAssignment.userId,
          message: `Task "${bounty.title}" verified! Reward added.`,
        },
        tx
      );

      return prize;
    });

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId: existingAssignment.familyId,
      reason: "TASK_VERIFIED",
      timestamp: Date.now(),
    };

    broadcastToFamily(existingAssignment.familyId, event);

    // 4) Return updated assignment + created reward snapshot
    return res.json({
      assignment: updatedAssignment,
      prize: createdPrize,
    });
  } catch (err) {
    console.error("verifyAssignedBounty error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// DELETE /bounty-assignments/:id
export const deleteAssignedBounty = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const assignment = await prisma.bountyAssignment.findUnique({
      where: { id },
    });

    if (!assignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const user = await assertFamilyMember(req, assignment.familyId);
    const familyId = assignment.familyId;
    // PARENTS: can always delete any assignment
    if (user.role === Role.PARENT) {
      await prisma.bountyAssignment.delete({ where: { id } });
      return res.status(204).send();
    }

    // CHILD: can delete only their own assignment while it's still OFFERED
    if (
      user.role === Role.CHILD &&
      user.id === assignment.userId &&
      assignment.status === BountyStatus.OFFERED
    ) {
      await prisma.bountyAssignment.delete({ where: { id } });
      return res.status(204).send();
    }

    // Everyone else: forbidden
    return res.status(403).json({ error: "FORBIDDEN" });

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId,
      reason: "TASK_REJECTED",
      timestamp: Date.now(),
    };

    broadcastToFamily(familyId, event);

  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("deleteAssignedBounty error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

