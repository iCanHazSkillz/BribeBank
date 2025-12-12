import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { assertFamilyMember, assertParent, getRequestUser } from "../lib/authHelpers.js";
import { broadcastToFamily } from "../realtime/eventBus.js";
import { SseEvent } from "../types/sseEvents.js";
import { addHistoryEvent } from "../services/historyService.js";
import { addNotification } from "../services/notificationService.js";
import { sendPushToUser } from "../services/pushService.js";

/**
 * POST /users/:userId/tickets
 * Give tickets to a user (parent only)
 */
export const giveTickets = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { amount } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "MISSING_USER_ID" });
  }
  if (typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ error: "INVALID_AMOUNT" });
  }

  try {
    const caller = await getRequestUser(req);
    if (!caller) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    // Find the target user
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, familyId: true, displayName: true, ticketBalance: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    // Ensure caller is in the same family
    await assertFamilyMember(req, targetUser.familyId);
    assertParent(caller);

    // Update ticket balance
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ticketBalance: {
          increment: amount,
        },
      },
      select: { id: true, ticketBalance: true, displayName: true },
    });

    // Add history event
    await addHistoryEvent({
      familyId: targetUser.familyId,
      userId: userId,
      userName: targetUser.displayName,
      title: `${amount} Tickets`,
      emoji: "🎟️",
      action: "RECEIVED_TICKETS",
      assignerName: caller.displayName,
    });

    // Notify the user
    await addNotification({
      userId: userId,
      message: `${caller.displayName} gave you ${amount} tickets!`,
    });

    // Send push notification
    try {
      await sendPushToUser(userId, {
        title: "You received tickets! 🎟️",
        body: `${caller.displayName} gave you ${amount} tickets!`,
        tag: "tickets-received",
        type: "TICKETS_GIVEN",
        familyId: targetUser.familyId,
        userId: userId,
        url: "/?view=wallet&walletTab=wallet",
      });
    } catch (pushErr) {
      console.warn("giveTickets push failed:", pushErr);
    }

    // Broadcast SSE event
    const event: SseEvent = {
      type: "TICKETS_GIVEN",
      familyId: targetUser.familyId,
      userId: userId,
      amount: amount,
      newBalance: updatedUser.ticketBalance,
      timestamp: Date.now(),
    };
    broadcastToFamily(targetUser.familyId, event);

    return res.json({
      success: true,
      ticketBalance: updatedUser.ticketBalance,
    });
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("giveTickets error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * GET /users/:userId/tickets
 * Get ticket balance for a user
 */
export const getTicketBalance = async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ error: "MISSING_USER_ID" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, familyId: true, ticketBalance: true },
    });

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    // Ensure caller is in the same family
    await assertFamilyMember(req, user.familyId);

    return res.json({
      userId: user.id,
      ticketBalance: user.ticketBalance,
    });
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("getTicketBalance error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};
