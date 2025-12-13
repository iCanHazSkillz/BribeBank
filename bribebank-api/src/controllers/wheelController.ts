import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { assertFamilyMember, assertParent } from "../lib/authHelpers.js";
import { broadcastToFamily } from "../realtime/eventBus.js";
import { SseEvent } from "../types/sseEvents.js";
import { addHistoryEvent } from "../services/historyService.js";
import { addNotification } from "../services/notificationService.js";
import { PrizeStatus, PrizeType } from "@prisma/client";

/**
 * GET /families/:familyId/wheel-segments
 * Get all wheel segments for a family
 */
export const getWheelSegments = async (req: Request, res: Response) => {
  const { familyId } = req.params;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }

  try {
    await assertFamilyMember(req, familyId);

    const segments = await prisma.wheelSegment.findMany({
      where: { familyId },
      orderBy: { createdAt: "asc" },
    });

    return res.json(segments);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("getWheelSegments error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * GET /families/:familyId/wheel-config
 * Get wheel configuration (spin cost)
 */
export const getWheelConfig = async (req: Request, res: Response) => {
  const { familyId } = req.params;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }

  try {
    await assertFamilyMember(req, familyId);

    const family = await prisma.family.findUnique({
      where: { id: familyId },
      select: { wheelSpinCost: true },
    });

    if (!family) {
      return res.status(404).json({ error: "FAMILY_NOT_FOUND" });
    }

    return res.json({ spinCost: family.wheelSpinCost });
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("getWheelConfig error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * PUT /families/:familyId/wheel-segments
 * Update all wheel segments (parent only)
 */
export const updateWheelSegments = async (req: Request, res: Response) => {
  const { familyId } = req.params;
  const { segments, spinCost } = req.body;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }

  if (!Array.isArray(segments)) {
    return res.status(400).json({ error: "INVALID_SEGMENTS" });
  }

  try {
    const user = await assertFamilyMember(req, familyId);
    assertParent(user);

    // Validate probabilities sum to ~1.0
    const totalProb = segments.reduce((sum, s) => sum + (s.prob || 0), 0);
    if (Math.abs(totalProb - 1.0) > 0.01) {
      return res
        .status(400)
        .json({ error: "PROBABILITIES_MUST_SUM_TO_ONE" });
    }

    // Delete existing segments and create new ones
    await prisma.wheelSegment.deleteMany({
      where: { familyId },
    });

    // Create segments sequentially to preserve order
    const createdSegments = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const created = await prisma.wheelSegment.create({
        data: {
          familyId,
          label: seg.label,
          color: seg.color,
          prob: seg.prob || 0.1,
        },
      });
      createdSegments.push(created);
    }

    // Update spin cost if provided
    if (typeof spinCost === "number" && spinCost >= 0) {
      await prisma.family.update({
        where: { id: familyId },
        data: { wheelSpinCost: spinCost },
      });
    }

    // Broadcast update
    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId,
      reason: "WHEEL_UPDATED",
      timestamp: Date.now(),
    };
    broadcastToFamily(familyId, event);

    return res.json({
      segments: createdSegments,
      spinCost: spinCost ?? (await prisma.family.findUnique({
        where: { id: familyId },
        select: { wheelSpinCost: true }
      }))?.wheelSpinCost
    });
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("updateWheelSegments error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * POST /families/:familyId/wheel-segments/reset
 * Reset wheel to default segments (parent only)
 */
export const resetWheelSegments = async (req: Request, res: Response) => {
  const { familyId } = req.params;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }

  try {
    const user = await assertFamilyMember(req, familyId);
    assertParent(user);

    const DEFAULT_SEGMENTS = [
      { label: "Not this time", color: "#9CA3AF", prob: 0.2 },
      { label: "30 Minute Screen Time", color: "#60A5FA", prob: 0.1 },
      { label: "Pick supper", color: "#F472B6", prob: 0.1 },
      { label: "Free Pop", color: "#818CF8", prob: 0.1 },
      { label: "Candy Run", color: "#FCD34D", prob: 0.1 },
      { label: "Date Night", color: "#9CA3AF", prob: 0.1 },
      { label: "1 Hour Screen Time", color: "#34D399", prob: 0.1 },
      { label: "Movie Night", color: "#A78BFA", prob: 0.1 },
      { label: "JACKPOT - $20", color: "#EF4444", prob: 0.1 },
    ];

    await prisma.wheelSegment.deleteMany({
      where: { familyId },
    });

    const segments = await Promise.all(
      DEFAULT_SEGMENTS.map((seg) =>
        prisma.wheelSegment.create({
          data: {
            familyId,
            ...seg,
          },
        })
      )
    );

    // Broadcast update
    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId,
      reason: "WHEEL_RESET",
      timestamp: Date.now(),
    };
    broadcastToFamily(familyId, event);

    return res.json(segments);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("resetWheelSegments error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * POST /families/:familyId/wheel-segments/spin
 * Spin the wheel
 */
export const spinWheel = async (req: Request, res: Response) => {
  const { familyId } = req.params;
  const { userId } = req.body;

  if (!familyId || !userId) {
    return res.status(400).json({ error: "MISSING_PARAMETERS" });
  }

  try {
    await assertFamilyMember(req, familyId);

    // Get family config
    const family = await prisma.family.findUnique({
      where: { id: familyId },
      select: { wheelSpinCost: true },
    });

    if (!family) {
      return res.status(404).json({ error: "FAMILY_NOT_FOUND" });
    }

    const spinCost = family.wheelSpinCost;

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.familyId !== familyId) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    // Check ticket balance
    if (user.ticketBalance < spinCost) {
      return res.status(400).json({ error: "INSUFFICIENT_TICKETS" });
    }

    // Get segments
    const segments = await prisma.wheelSegment.findMany({
      where: { familyId },
      orderBy: { createdAt: "asc" },
    });

    if (segments.length === 0) {
      return res.status(400).json({ error: "NO_WHEEL_SEGMENTS" });
    }

    // Deduct tickets
    await prisma.user.update({
      where: { id: userId },
      data: {
        ticketBalance: {
          decrement: spinCost,
        },
      },
    });

    // Pick winner based on probability
    const rand = Math.random();
    let cumulative = 0;
    let winner = segments[0];

    for (const seg of segments) {
      cumulative += seg.prob;
      if (rand <= cumulative) {
        winner = seg;
        break;
      }
    }

    // Check if this is a losing spin
    const isLosingSpin = winner.label.toLowerCase().includes("try again") || 
                        winner.label.toLowerCase().includes("not this time");

    // Determine emoji for prize (map common prize names to emojis)
    const getEmojiForPrize = (label: string): string => {
      const lower = label.toLowerCase();
      if (lower.includes("screen") || lower.includes("tv")) return "📺";
      if (lower.includes("candy")) return "🍬";
      if (lower.includes("pop") || lower.includes("soda")) return "🥤";
      if (lower.includes("movie")) return "🎬";
      if (lower.includes("money") || lower.includes("$")) return "💵";
      if (lower.includes("supper") || lower.includes("dinner")) return "🍽️";
      if (lower.includes("date")) return "❤️";
      if (lower.includes("not")) return "❌";
      return "🎁";
    };

    const emoji = getEmojiForPrize(winner.label);

    // Only add notification and history for winning spins
    if (!isLosingSpin) {
      // Add notification
      await addNotification({
        userId,
        message: `You spun the wheel and won: ${winner.label}!`,
      });

      // Add history event
      await addHistoryEvent({
        familyId,
        userId,
        userName: user.displayName,
        emoji,
        title: winner.label,
        action: "WHEEL_SPIN_WON",
        assignerName: "Prize Wheel",
      });
    }

    // If not "Try Again", create prize assignment
    if (!isLosingSpin) {
      await prisma.assignedPrize.create({
        data: {
          familyId,
          userId,
          assignedBy: "Prize Wheel",
          status: PrizeStatus.AVAILABLE,
          title: winner.label,
          emoji,
          description: `Won from Prize Wheel!`,
          type: PrizeType.PRIVILEGE,
          themeColor: "bg-gradient-to-r from-purple-400 to-pink-600",
        },
      });
    }

    // Broadcast update
    const event: SseEvent = {
      type: "WALLET_UPDATE",
      familyId,
      reason: "WHEEL_SPIN",
      timestamp: Date.now(),
    };
    broadcastToFamily(familyId, event);

    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { ticketBalance: true },
    });

    return res.json({
      won: !isLosingSpin,
      prize: winner.label,
      emoji,
      newBalance: updatedUser?.ticketBalance || 0,
    });
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("spinWheel error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};
