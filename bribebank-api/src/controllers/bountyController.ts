import { Request, Response } from "express";
import { BountyStatus, Role, PrizeStatus, PrizeType, DenialReason } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { assertFamilyMember, assertParent, getRequestUser } from "../lib/authHelpers.js";
import { broadcastToFamily } from "../realtime/eventBus.js";
import { sendPushToUser } from "../services/pushService.js";
import { SseEvent } from "../types/sseEvents";
import { addHistoryEvent } from "../services/historyService.js";
import { addNotification } from "../services/notificationService.js";
import { processTaskPhoto } from "../lib/imageProcessor.js";

type TaskLifecycleMetadata = {
  version: 1;
  lifecycleType: "TASK";
  bountyAssignmentId: string;
  bountyId?: string;
  rewardAssignmentId?: string;
  rewardType?: "TICKETS" | "CUSTOM";
  rewardValue?: string;
  linkedAction?: string;
  denialMessage?: string;
  allowResubmit?: boolean;
};

const buildTaskLifecycleMetadata = (
  data: Omit<TaskLifecycleMetadata, "version" | "lifecycleType">
) =>
  JSON.stringify({
    version: 1,
    lifecycleType: "TASK",
    ...data,
  } satisfies TaskLifecycleMetadata);

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
      orderBy: { createdAt: "desc" },
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
  const { title, emoji, rewardType, rewardValue, isFCFS, rewardTemplateId, themeColor, deadlineHours, requiresPhoto } = req.body;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }
  if (!title || !emoji || !rewardValue) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  // Validate deadline if provided
  if (deadlineHours !== undefined && deadlineHours !== null) {
    const hours = Number(deadlineHours);
    if (isNaN(hours) || hours < 1) {
      return res.status(400).json({ error: "INVALID_DEADLINE_HOURS" });
    }
  }

  try {
    const user = await assertFamilyMember(req, familyId);
    assertParent(user);

    const bounty = await prisma.bounty.create({
      data: {
        familyId,
        title,
        emoji,
        rewardType: rewardType ?? null,
        rewardValue,
        isFCFS: !!isFCFS,
        rewardTemplateId: rewardTemplateId ?? null,
        themeColor: themeColor ?? null,
        deadlineHours: deadlineHours ? Number(deadlineHours) : null,
        requiresPhoto: !!requiresPhoto,
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
  const { title, emoji, rewardType, rewardValue, isFCFS, rewardTemplateId, themeColor, deadlineHours, requiresPhoto } = req.body;

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
    
    // Validate deadlineHours if provided
    if (deadlineHours !== undefined && deadlineHours !== null) {
      if (typeof deadlineHours !== 'number' || deadlineHours < 1) {
        return res.status(400).json({ error: "DEADLINE_MUST_BE_AT_LEAST_1_HOUR" });
      }
    }
    
    const updated = await prisma.bounty.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        emoji: emoji ?? existing.emoji,
        rewardType: rewardType !== undefined ? rewardType : existing.rewardType,
        rewardValue: rewardValue ?? existing.rewardValue,
        isFCFS:
          typeof isFCFS === "boolean" ? isFCFS : existing.isFCFS,
        rewardTemplateId:
          rewardTemplateId !== undefined
            ? rewardTemplateId
            : existing.rewardTemplateId,
        themeColor: themeColor ?? undefined,
        deadlineHours: deadlineHours !== undefined ? deadlineHours : existing.deadlineHours,
        requiresPhoto: typeof requiresPhoto === "boolean" ? requiresPhoto : existing.requiresPhoto,
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

    // Fetch assigner details for each assignment
    const enrichedAssignments = await Promise.all(
      assignments.map(async (assignment) => {
        const assigner = await prisma.user.findUnique({
          where: { id: assignment.assignedBy },
          select: { displayName: true },
        });

        return {
          ...assignment,
          assignerName: assigner?.displayName || 'Parent',
        };
      })
    );

    return res.json(enrichedAssignments);
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
// Make sure you have this import at the top of bountyController.ts:
// import { sendPushToUser } from "../services/pushService.js";

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

    if (child.id === parent.id) {
      return res
        .status(400)
        .json({ error: "CANNOT_ASSIGN_TASK_TO_SELF" });
    }

    const parentName = parent.displayName || parent.username || "Parent";
    const childName = child.displayName || child.username || "Child";
    const emoji = bounty.emoji || "🧹";
    const title = bounty.title || "Task";

    // Assignment + history + notification as one atomic unit
    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.bountyAssignment.create({
        data: {
          familyId,
          bountyId,
          userId,
          assignedBy: parent.id,
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
          title,
          emoji,
          action: "TASK_ASSIGNED", // keep your naming consistent across app
          assignerName: parentName,
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: created.id,
            bountyId: bounty.id,
            rewardType: bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
            rewardValue: bounty.rewardValue,
            linkedAction: "TASK_ASSIGNED",
          }),
        },
        tx
      );

      await addNotification(
        {
          userId: child.id,
          message: `${parentName} assigned you a new task: ${title}`,
        },
        tx
      );

      return created;
    });

    // Push (non-blocking safety)
    try {
      await sendPushToUser(child.id, {
        title: "New task assigned 🧹",
        body: `${parentName} assigned: ${title}`,
        tag: "task-assigned",
        type: "TASK_ASSIGNED",
        familyId,
        bountyId: bounty.id,
        assignmentId: assignment.id,

        // Deep link for your App.tsx + WalletView parser
        url: "/?view=wallet&walletTab=tasks",
      });
    } catch (pushErr) {
      // Don't fail the request just because push failed
      console.warn("assignBounty push failed:", pushErr);
    }

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
// POST /bounty-assignments/:id/accept
export const acceptAssignedBounty = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  try {
    const assignment = await prisma.bountyAssignment.findUnique({
      where: { id },
      include: { bounty: true },
    });

    if (!assignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const bounty = assignment.bounty;
    if (!bounty) {
      return res.status(404).json({ error: "BOUNTY_NOT_FOUND" });
    }

    // Only the assigned child can accept
    const user = await assertFamilyMember(req, assignment.familyId);
    if (user.id !== assignment.userId) {
      return res.status(403).json({ error: "ONLY_ASSIGNEE_CAN_ACCEPT" });
    }

    if (assignment.status !== BountyStatus.OFFERED) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    const childName = user.displayName || user.username || "Child";
    const emoji = bounty.emoji || "🧹";
    const title = bounty.title || "Task";

    // We'll capture these inside the transaction so we don't re-query later
    let parentIds: string[] = [];
    let fcfsLoserUserIds: string[] = [];

    const updated = await prisma.$transaction(async (tx) => {
      // If FCFS, preload the other OFFERED assignments so we can notify losers
      if (bounty.isFCFS) {
        const others = await tx.bountyAssignment.findMany({
          where: {
            bountyId: assignment.bountyId,
            familyId: assignment.familyId,
            status: BountyStatus.OFFERED,
            NOT: { id: assignment.id },
          },
          select: { id: true, userId: true },
        });

        fcfsLoserUserIds = others.map((o) => o.userId);

        if (others.length) {
          await tx.bountyAssignment.deleteMany({
            where: { id: { in: others.map((o) => o.id) } },
          });
        }
      }

      // Calculate deadline expiration if bounty has a deadline
      const now = new Date();
      let deadlineExpiresAt: Date | undefined;
      if (bounty.deadlineHours) {
        deadlineExpiresAt = new Date(now.getTime() + bounty.deadlineHours * 3600000);
      }

      const updatedAssignment = await tx.bountyAssignment.update({
        where: { id },
        data: { 
          status: BountyStatus.IN_PROGRESS,
          deadlineStartedAt: bounty.deadlineHours ? now : undefined,
          deadlineExpiresAt: deadlineExpiresAt,
        },
      });

      await addHistoryEvent(
        {
          familyId: assignment.familyId,
          userId: assignment.userId,
          userName: childName,
          title,
          emoji,
          action: "TASK_ACCEPTED", // keep your action string for consistency
          assignerName: childName, // actor is the child
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: assignment.id,
            bountyId: bounty.id,
            rewardType: bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
            rewardValue: bounty.rewardValue,
            linkedAction: "TASK_ACCEPTED",
          }),
        },
        tx
      );

      const parents = await tx.user.findMany({
        where: { familyId: assignment.familyId, role: "PARENT" },
        select: { id: true },
      });

      parentIds = parents.map((p) => p.id);

      // Parent in-app notifications
      await Promise.all(
        parentIds.map((pid) =>
          addNotification(
            {
              userId: pid,
              message: bounty.isFCFS
                ? `${childName} accepted FCFS task: ${title}`
                : `${childName} accepted task: ${title}`,
            },
            tx
          )
        )
      );

      // FCFS loser in-app notifications
      if (bounty.isFCFS && fcfsLoserUserIds.length) {
        await Promise.all(
          fcfsLoserUserIds.map((uid) =>
            addNotification(
              {
                userId: uid,
                message: `Too late — "${title}" was claimed by ${childName}.`,
              },
              tx
            )
          )
        );
      }

      return updatedAssignment;
    });

    // Push to parents (after transaction succeeds)
    try {
      await Promise.all(
        parentIds.map((pid) =>
          sendPushToUser(pid, {
            title: "Task accepted ✅",
            body: bounty.isFCFS
              ? `${childName} accepted FCFS task: ${title}`
              : `${childName} accepted: ${title}`,
            tag: "task-accepted",
            type: "TASK_ACCEPTED",
            familyId: assignment.familyId,
            bountyId: bounty.id,
            assignmentId: assignment.id,

            // Accept doesn't need approvals — tasks view is more logical
            url: "/?view=admin&adminTab=tasks",
          })
        )
      );
    } catch (pushErr) {
      console.warn("acceptAssignedBounty parent push failed:", pushErr);
    }

    // Optional: push to FCFS losers (nice UX)
    if (bounty.isFCFS && fcfsLoserUserIds.length) {
      await Promise.all(
        fcfsLoserUserIds.map((uid) =>
          sendPushToUser(uid, {
            title: "Task already claimed",
            body: `"${title}" was claimed by ${childName}.`,
            tag: "task-fcfs-missed",
            type: "TASK_FCFS_MISSED",
            familyId: assignment.familyId,
            bountyId: bounty.id,
            url: "/?view=wallet&walletTab=tasks",
          }).catch((err) =>
            console.warn("acceptAssignedBounty loser push failed:", err)
          )
        )
      );
    }

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
  let { photoUrl } = req.body;

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

    // Validate photo requirement
    if (bounty.requiresPhoto && !photoUrl) {
      return res.status(400).json({ error: "PHOTO_REQUIRED" });
    }

    // Process photo if provided (resize and compress)
    if (photoUrl && photoUrl.startsWith('data:image/')) {
      photoUrl = await processTaskPhoto(photoUrl);
    }

    // Allow completion from IN_PROGRESS or DENIED (resubmission after denial)
    if (assignment.status !== BountyStatus.IN_PROGRESS && assignment.status !== BountyStatus.DENIED) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    const childName = child.displayName || child.username || "Child";
    const emoji = bounty.emoji || "🧹";
    const title = bounty.title || "Task";
    const now = new Date();

    let parentIds: string[] = [];

    const updated = await prisma.$transaction(async (tx) => {
      const updatedAssignment = await tx.bountyAssignment.update({
        where: { id },
        data: {
          status: BountyStatus.COMPLETED,
          completedAt: now,
          photoUrl: photoUrl ?? null,
          // Clear denial reason and notes if resubmitting after denial
          denialReason: null,
          denialNotes: null,
          deniedAt: null,
        },
      });

      await addHistoryEvent(
        {
          familyId: assignment.familyId,
          userId: assignment.userId,
          userName: childName,
          title,
          emoji,
          action: "TASK_COMPLETED",
          assignerName: childName, // actor is the child
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: assignment.id,
            bountyId: bounty.id,
            rewardType: bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
            rewardValue: bounty.rewardValue,
            linkedAction: "TASK_COMPLETED",
          }),
        },
        tx
      );

      const parents = await tx.user.findMany({
        where: { familyId: assignment.familyId, role: "PARENT" },
        select: { id: true },
      });

      parentIds = parents.map((p) => p.id);

      await Promise.all(
        parentIds.map((pid) =>
          addNotification(
            {
              userId: pid,
              message: `${childName} marked task "${title}" as complete. Waiting for verification.`,
            },
            tx
          )
        )
      );

      return updatedAssignment;
    });

    // Push to parents: "verification needed"
    try {
      await Promise.all(
        parentIds.map((pid) =>
          sendPushToUser(pid, {
            title: "Task completed 🧹",
            body: `${childName} completed: ${title}. Tap to verify.`,
            tag: "task-completed",
            type: "TASK_COMPLETED",
            familyId: assignment.familyId,
            bountyId: bounty.id,
            assignmentId: assignment.id,
            childId: child.id,

            // Deep link to parent approvals
            url: "/?view=admin&adminTab=approvals",
          })
        )
      );
    } catch (pushErr) {
      console.warn("completeAssignedBounty push failed:", pushErr);
    }

    // Broadcast to admin dashboards (child action)
    const event: SseEvent = {
      type: "CHILD_ACTION",
      familyId: assignment.familyId,
      subtype: "TASK_COMPLETED",
      id,
      userId: user.id,
      timestamp: Date.now(),
    };

    broadcastToFamily(assignment.familyId, event);

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

    if (parent.id === child.id) {
      return res
        .status(403)
        .json({ error: "CANNOT_VERIFY_OWN_TASK" });
    }
    
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

    const parentName = parent.displayName || parent.username || "Parent";
    const childName = child.displayName || child.username || "Child";

    // 2) Check if this is a ticket-based reward
    if (bounty.rewardType === 'TICKETS') {
      // Add tickets directly to child's balance
      const ticketAmount = parseInt(bounty.rewardValue);
      
      if (isNaN(ticketAmount) || ticketAmount <= 0) {
        return res.status(400).json({ error: "INVALID_TICKET_AMOUNT" });
      }

      await prisma.$transaction(async (tx) => {
        // Update child's ticket balance
        await tx.user.update({
          where: { id: child.id },
          data: {
            ticketBalance: {
              increment: ticketAmount,
            },
          },
        });

        // Log task verification
        await addHistoryEvent(
          {
            familyId: existingAssignment.familyId,
            userId: existingAssignment.userId,
            userName: childName,
            title: bounty.title,
            emoji: bounty.emoji || "🧹",
            action: "VERIFIED_TASK",
            assignerName: parentName,
            metadata: buildTaskLifecycleMetadata({
              bountyAssignmentId: existingAssignment.id,
              bountyId: bounty.id,
              rewardType: "TICKETS",
              rewardValue: String(ticketAmount),
              linkedAction: "VERIFIED_TASK",
            }),
          },
          tx
        );

        // Log ticket earnings
        await addHistoryEvent(
          {
            familyId: existingAssignment.familyId,
            userId: existingAssignment.userId,
            userName: childName,
            title: `${ticketAmount} Tickets`,
            emoji: "🎟️",
            action: "EARNED_TICKETS",
            assignerName: parentName,
            metadata: buildTaskLifecycleMetadata({
              bountyAssignmentId: existingAssignment.id,
              bountyId: bounty.id,
              rewardType: "TICKETS",
              rewardValue: String(ticketAmount),
              linkedAction: "EARNED_TICKETS",
            }),
          },
          tx
        );

        await addNotification(
          {
            userId: existingAssignment.userId,
            message: `Task "${bounty.title}" verified! +${ticketAmount} tickets.`,
          },
          tx
        );
      });

      // Send push notification
      try {
        await sendPushToUser(child.id, {
          title: "Your task was verified ✅",
          body: `${parentName} verified: ${bounty.title}. +${ticketAmount} tickets!`,
          tag: "task-verified",
          type: "TASK_VERIFIED",
          familyId: existingAssignment.familyId,
          assignmentId: existingAssignment.id,
          url: "/?view=wallet&walletTab=tasks",
        });
      } catch (pushErr) {
        console.warn("verifyAssignedBounty push failed:", pushErr);
      }

      const event: SseEvent = {
        type: "WALLET_UPDATE",
        familyId: existingAssignment.familyId,
        reason: "TASK_VERIFIED",
        timestamp: Date.now(),
      };

      broadcastToFamily(existingAssignment.familyId, event);

      return res.json({
        assignment: updatedAssignment,
        ticketsAwarded: ticketAmount,
      });
    }

    // 3) Custom reward - Build snapshot fields for reward card
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
        snapshotEmoji = "🎀";
        snapshotDescription = `Reward for completing: ${bounty.title}`;
        snapshotType = PrizeType.PRIVILEGE;
        snapshotThemeColor = "bg-green-100 text-green-800 border-green-200";
      }
    } else {
      // Bounty-based reward only
      snapshotTitle = bounty.rewardValue;
      snapshotEmoji = "🎀";
      snapshotDescription = `Reward for completing: ${bounty.title}`;
      snapshotType = PrizeType.PRIVILEGE;
      snapshotThemeColor = "bg-green-100 text-green-800 border-green-200";
    }

    // 4) Transaction: create prize, log history, notify child
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
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: existingAssignment.id,
            bountyId: bounty.id,
            rewardType: "CUSTOM",
            rewardValue: snapshotTitle,
            linkedAction: "VERIFIED_TASK",
          }),
        },
        tx
      );

      await addHistoryEvent(
        {
          familyId: existingAssignment.familyId,
          userId: existingAssignment.userId,
          userName: childName,
          title: snapshotTitle,
          emoji: snapshotEmoji,
          action: "TASK_REWARD_GRANTED",
          assignerName: parentName,
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: existingAssignment.id,
            bountyId: bounty.id,
            rewardAssignmentId: prize.id,
            rewardType: "CUSTOM",
            rewardValue: snapshotTitle,
            linkedAction: "TASK_REWARD_GRANTED",
          }),
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

    // --- PUSH NOTIFICATION (fixed) ---
    try {
      await sendPushToUser(child.id, {
        title: "Your task was verified ✅",
        body: `${parentName} verified: ${bounty.title}`,
        tag: "reward-verified",
        type: "REWARD_VERIFIED",
        familyId: existingAssignment.familyId,
        assignmentId: existingAssignment.id,
        // If you want a deep link, adjust as desired:
        url: "/?view=wallet&walletTab=wallet",
      });
    } catch (pushErr) {
      console.warn("verifyAssignedBounty push failed:", pushErr);
    }

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

// POST /bounty-assignments/:id/deny
export const denyAssignedBounty = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { denialReason, denialNotes, allowResubmit = true } = req.body;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ASSIGNMENT_ID" });
  }

  if (!denialReason) {
    return res.status(400).json({ error: "MISSING_DENIAL_REASON" });
  }

  // Validate the denial reason is one of the enum values
  const validReasons = Object.values(DenialReason);
  if (!validReasons.includes(denialReason)) {
    return res.status(400).json({ error: "INVALID_DENIAL_REASON" });
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

    if (parent.id === child.id) {
      return res
        .status(403)
        .json({ error: "CANNOT_DENY_OWN_TASK" });
    }

    if (existingAssignment.status !== BountyStatus.COMPLETED) {
      return res.status(400).json({ error: "INVALID_STATUS" });
    }

    let updatedAssignment;
    
    if (allowResubmit) {
      // Update bounty assignment to DENIED status (child can resubmit)
      updatedAssignment = await prisma.bountyAssignment.update({
        where: { id },
        data: {
          status: BountyStatus.DENIED,
          denialReason,
          denialNotes: denialNotes || null,
          deniedAt: new Date(),
        },
      });
    } else {
      // Delete the assignment entirely (task cancelled, no resubmit)
      updatedAssignment = existingAssignment;
      await prisma.bountyAssignment.delete({
        where: { id },
      });
    }

    const parentName = parent.displayName || parent.username || "Parent";
    const childName = child.displayName || child.username || "Child";

    // Create human-readable reason message
    const reasonMessages: Record<DenialReason, string> = {
      [DenialReason.NOT_COMPLETED_ADEQUATELY]: "Task not completed to adequate standard",
      [DenialReason.TOO_OLD_NO_LONGER_REQUIRED]: "Task too old and no longer required",
      [DenialReason.NOT_COMPLETED]: "Task not completed",
      [DenialReason.INSTRUCTIONS_NOT_FOLLOWED]: "Didn't follow the instructions",
      [DenialReason.LOW_EFFORT]: "Not enough effort / rushed",
      [DenialReason.COMPLETED_AFTER_DEADLINE]: "Completed after the deadline",
    };

    const reasonMessage = reasonMessages[denialReason as DenialReason];
    
    // Build full message with notes if provided
    const fullMessage = denialNotes ? `${reasonMessage}: ${denialNotes}` : reasonMessage;

    // Log task denial in history and add notification in a transaction
    await prisma.$transaction(async (tx) => {
      // Log task denial in history
      await addHistoryEvent(
        {
          familyId: existingAssignment.familyId,
          userId: existingAssignment.userId,
          userName: childName,
          title: bounty.title,
          emoji: bounty.emoji || "🧹",
          action: "DENIED_TASK",
          assignerName: parentName,
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: existingAssignment.id,
            bountyId: bounty.id,
            rewardType: bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
            rewardValue: bounty.rewardValue,
            linkedAction: "DENIED_TASK",
            denialMessage: fullMessage,
            allowResubmit,
          }),
        },
        tx
      );

      // Add notification to child
      const notificationMessage = allowResubmit
        ? `Task "${bounty.title}" was denied: ${fullMessage}. Please try again!`
        : `Task "${bounty.title}" was cancelled: ${fullMessage}.`;
      
      await addNotification(
        {
          userId: existingAssignment.userId,
          message: notificationMessage,
        },
        tx
      );
    });

    // Send push notification
    try {
      const pushTitle = allowResubmit ? "Task Denied ❌" : "Task Cancelled 🚫";
      const pushBody = allowResubmit
        ? `${parentName} denied: ${bounty.title}. ${fullMessage}.`
        : `${parentName} cancelled: ${bounty.title}. ${fullMessage}.`;
      
      await sendPushToUser(child.id, {
        title: pushTitle,
        body: pushBody,
        tag: "task-denied",
        type: "TASK_DENIED",
        familyId: existingAssignment.familyId,
        assignmentId: existingAssignment.id,
        url: "/?view=wallet&walletTab=tasks",
      });
    } catch (pushErr) {
      console.warn("denyAssignedBounty push failed:", pushErr);
    }

    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId: existingAssignment.familyId,
      reason: "TASK_DENIED",
      timestamp: Date.now(),
    };

    broadcastToFamily(existingAssignment.familyId, event);

    return res.json({
      assignment: updatedAssignment,
      denialReason: fullMessage,
    });
  } catch (err) {
    console.error("denyAssignedBounty error:", err);
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
      include: {
        bounty: true,
        user: true,
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const user = await assertFamilyMember(req, assignment.familyId);
    const familyId = assignment.familyId;
    const bounty = assignment.bounty;
    const child = assignment.user;
    
    // PARENTS: can always delete any assignment
    if (user.role === Role.PARENT) {
      await prisma.bountyAssignment.delete({ where: { id } });
      return res.status(204).send();
    }

    // CHILD: can delete only their own assignment while it's OFFERED or DENIED
    if (
      user.role === Role.CHILD &&
      user.id === assignment.userId &&
      (assignment.status === BountyStatus.OFFERED || assignment.status === BountyStatus.DENIED)
    ) {
      const wasDenied = assignment.status === BountyStatus.DENIED;
      const wasOffered = assignment.status === BountyStatus.OFFERED;
      
      await prisma.bountyAssignment.delete({ where: { id } });
      
      // Notify parents when child rejects any task (OFFERED or DENIED)
      if ((wasDenied || wasOffered) && bounty && child) {
        const childName = child.displayName || child.username || "Child";
        const message = wasDenied 
          ? `${childName} rejected the denied task "${bounty.title}"`
          : `${childName} refused the task "${bounty.title}"`;
        
        const action = wasDenied ? "TASK_REJECTED_AFTER_DENIAL" : "TASK_REFUSED";
        
        // Add history event
        await addHistoryEvent({
          familyId,
          userId: user.id,
          userName: childName,
          title: bounty.title,
          emoji: bounty.emoji,
          action,
          assignerName: childName,
          metadata: buildTaskLifecycleMetadata({
            bountyAssignmentId: assignment.id,
            bountyId: bounty.id,
            rewardType: bounty.rewardType === "TICKETS" ? "TICKETS" : "CUSTOM",
            rewardValue: bounty.rewardValue,
            linkedAction: action,
          }),
        });

        // Notify all parents in the family
        const parents = await prisma.user.findMany({
          where: { familyId, role: Role.PARENT },
        });

        for (const parent of parents) {
          await addNotification({
            userId: parent.id,
            message,
          });

          await sendPushToUser(parent.id, {
            title: wasDenied ? "Task Rejected" : "Task Refused",
            body: message,
            icon: bounty.emoji,
          });
        }
      }
      
      const event: SseEvent = {
        type: "WALLET_UPDATE",
        familyId,
        reason: "TASK_REJECTED",
        timestamp: Date.now(),
      };

      broadcastToFamily(familyId, event);
      
      return res.status(204).send();
    }

    // Everyone else: forbidden
    return res.status(403).json({ error: "FORBIDDEN" });

  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("deleteAssignedBounty error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

