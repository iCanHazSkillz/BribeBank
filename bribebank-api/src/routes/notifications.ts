import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "../services/notificationService.js";

const router = Router();

/**
 * GET /users/:userId/notifications
 *
 * Returns unread notifications for a user.
 * - Caller must be that user (for now).
 *   If later you want parents to see child notifications, we can relax this
 *   and add a role check.
 */
router.get(
  "/users/:userId/notifications",
  authMiddleware,
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const authUserId = req.userId;

    if (!userId) {
      return res.status(400).json({ error: "MISSING_USER_ID" });
    }

    if (!authUserId || authUserId !== userId) {
      // Hard rule for now: only see your own notifications
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    try {
      const notifications = await prisma.notification.findMany({
        where: { userId, isRead: false },
        orderBy: { createdAt: "desc" },
      });

      return res.json(notifications);
    } catch (err) {
      console.error("GET /users/:userId/notifications error:", err);
      return res
        .status(500)
        .json({ error: "INTERNAL_SERVER_ERROR" });
    }
  }
);

/**
 * POST /notifications/:id/read
 *
 * Marks a single notification as read.
 * - Caller must own the notification.
 */
router.post(
  "/notifications/:id/read",
  authMiddleware,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const authUserId = req.userId;

    if (!id) {
      return res.status(400).json({ error: "MISSING_NOTIFICATION_ID" });
    }

    try {
      const notification = await prisma.notification.findUnique({
        where: { id },
      });

      if (!notification) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }

      if (!authUserId || notification.userId !== authUserId) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      const updated = await markNotificationRead(id);
      return res.json(updated);
    } catch (err) {
      console.error("POST /notifications/:id/read error:", err);
      return res
        .status(500)
        .json({ error: "INTERNAL_SERVER_ERROR" });
    }
  }
);

/**
 * POST /users/:userId/notifications/read-all
 *
 * Marks all notifications for a user as read.
 * - Caller must be that user.
 */
router.post(
  "/users/:userId/notifications/read-all",
  authMiddleware,
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const authUserId = req.userId;

    if (!userId) {
      return res.status(400).json({ error: "MISSING_USER_ID" });
    }

    if (!authUserId || authUserId !== userId) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    try {
      await markAllNotificationsRead(userId);
      return res.status(204).send();
    } catch (err) {
      console.error(
        "POST /users/:userId/notifications/read-all error:",
        err
      );
      return res
        .status(500)
        .json({ error: "INTERNAL_SERVER_ERROR" });
    }
  }
);

export default router;
