import { Request, Response } from "express";
import { PrizeStatus, PrizeType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { assertFamilyMember, assertParent, getRequestUser } from "../lib/authHelpers.js";
import { broadcastToFamily } from "../realtime/eventBus.js";
import { SseEvent } from "../types/sseEvents.js";
import { addNotification } from "../services/notificationService.js";
import { sendPushToUser } from "../services/pushService.js";

/**
 * GET /families/:familyId/store-items
 * List all store items for a family
 */
export const getFamilyStoreItems = async (req: Request, res: Response) => {
  const { familyId } = req.params;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }

  try {
    await assertFamilyMember(req, familyId);

    const items = await prisma.storeItem.findMany({
      where: { familyId },
      orderBy: { createdAt: "desc" },
    });

    return res.json(items);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("getFamilyStoreItems error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * POST /families/:familyId/store-items
 * Create a new store item
 */
export const createStoreItem = async (req: Request, res: Response) => {
  const { familyId } = req.params;
  const { title, cost, imageUrl, productUrl, description } = req.body;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }
  if (!title || typeof cost !== "number" || cost < 0) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    const user = await assertFamilyMember(req, familyId);
    assertParent(user);

    const item = await prisma.storeItem.create({
      data: {
        familyId,
        title,
        cost,
        imageUrl: imageUrl ?? null,
        productUrl: productUrl ?? null,
        description: description ?? null,
      },
    });

    const event: SseEvent = {
      type: "STORE_ITEM_ADDED",
      familyId,
      itemId: item.id,
      timestamp: Date.now(),
    };
    broadcastToFamily(familyId, event);

    return res.status(201).json(item);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("createStoreItem error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * PUT /store-items/:id
 * Update a store item
 */
export const updateStoreItem = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, cost, imageUrl, productUrl, description } = req.body;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ITEM_ID" });
  }

  try {
    const existingItem = await prisma.storeItem.findUnique({
      where: { id },
      select: { familyId: true },
    });

    if (!existingItem) {
      return res.status(404).json({ error: "ITEM_NOT_FOUND" });
    }

    const user = await assertFamilyMember(req, existingItem.familyId);
    assertParent(user);

    const updatedItem = await prisma.storeItem.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(typeof cost === "number" && { cost }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(productUrl !== undefined && { productUrl }),
        ...(description !== undefined && { description }),
      },
    });

    const event: SseEvent = {
      type: "STORE_ITEM_UPDATED",
      familyId: existingItem.familyId,
      itemId: id,
      timestamp: Date.now(),
    };
    broadcastToFamily(existingItem.familyId, event);

    return res.json(updatedItem);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("updateStoreItem error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * DELETE /store-items/:id
 * Delete a store item
 */
export const deleteStoreItem = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ITEM_ID" });
  }

  try {
    const existingItem = await prisma.storeItem.findUnique({
      where: { id },
      select: { familyId: true },
    });

    if (!existingItem) {
      return res.status(404).json({ error: "ITEM_NOT_FOUND" });
    }

    const user = await assertFamilyMember(req, existingItem.familyId);
    assertParent(user);

    await prisma.storeItem.delete({
      where: { id },
    });

    const event: SseEvent = {
      type: "STORE_ITEM_DELETED",
      familyId: existingItem.familyId,
      itemId: id,
      timestamp: Date.now(),
    };
    broadcastToFamily(existingItem.familyId, event);

    return res.json({ success: true });
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("deleteStoreItem error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

/**
 * POST /store-items/:id/purchase
 * Purchase a store item (child action)
 */
export const purchaseStoreItem = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;

  if (!id) {
    return res.status(400).json({ error: "MISSING_ITEM_ID" });
  }
  if (!userId) {
    return res.status(400).json({ error: "MISSING_USER_ID" });
  }

  try {
    const caller = getRequestUser(req);

    // Find the store item
    const item = await prisma.storeItem.findUnique({
      where: { id },
    });

    if (!item) {
      return res.status(404).json({ error: "ITEM_NOT_FOUND" });
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        familyId: true,
        displayName: true,
        ticketBalance: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    // Ensure item and user are in same family
    if (item.familyId !== user.familyId) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    await assertFamilyMember(req, user.familyId);

    // Check if user has enough tickets
    if (user.ticketBalance < item.cost) {
      return res.status(400).json({ error: "INSUFFICIENT_TICKETS" });
    }

    // Deduct tickets
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ticketBalance: {
          decrement: item.cost,
        },
      },
      select: { ticketBalance: true },
    });

    // Create a fulfillment prize assignment
    const assignment = await prisma.assignedPrize.create({
      data: {
        familyId: user.familyId,
        userId: userId,
        assignedBy: "store_system",
        status: PrizeStatus.PENDING_APPROVAL,
        title: `STORE: ${item.title}`,
        emoji: "🛍️",
        description: `Bought from store. Link: ${item.productUrl || "N/A"}`,
        type: PrizeType.PRIVILEGE,
        themeColor: "bg-teal-100 text-teal-800 border-teal-200",
        claimedAt: new Date(),
      },
    });

    // Notify all parents
    const parents = await prisma.user.findMany({
      where: {
        familyId: user.familyId,
        role: "PARENT",
      },
      select: { id: true },
    });

    for (const parent of parents) {
      await addNotification({
        userId: parent.id,
        message: `${user.displayName} bought "${item.title}" from the store! Please fulfill.`,
      });

      // Send push notification to parent
      try {
        await sendPushToUser(parent.id, {
          title: "Store Purchase Request 🛍️",
          body: `${user.displayName} bought "${item.title}" - Please fulfill!`,
          tag: "store-purchase",
          type: "STORE_PURCHASE",
          familyId: user.familyId,
          assignmentId: assignment.id,
          url: "/?view=admin&adminTab=approvals",
        });
      } catch (pushErr) {
        console.warn("purchaseStoreItem push failed for parent:", parent.id, pushErr);
      }
    }

    // Broadcast SSE event
    const event: SseEvent = {
      type: "STORE_PURCHASE",
      familyId: user.familyId,
      userId: userId,
      itemId: id,
      assignmentId: assignment.id,
      newBalance: updatedUser.ticketBalance,
      timestamp: Date.now(),
    };
    broadcastToFamily(user.familyId, event);

    return res.json({
      success: true,
      ticketBalance: updatedUser.ticketBalance,
      assignmentId: assignment.id,
    });
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }

    console.error("purchaseStoreItem error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};
