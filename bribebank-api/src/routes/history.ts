import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { assertFamilyMember } from "../lib/authHelpers.js";

const router = Router();

/**
 * GET /families/:familyId/history?userId=<childId>
 *
 * Returns history events for a family.
 * - If userId is provided, we filter to that child.
 * - Caller must belong to the same family (assertFamilyMember).
 */
router.get(
  "/families/:familyId/history",
  authMiddleware,
  async (req: Request, res: Response) => {
    const { familyId } = req.params;
    const userId = req.query.userId as string | undefined;

    if (!familyId) {
      return res.status(400).json({ error: "MISSING_FAMILY_ID" });
    }

    try {
      // Ensure caller is in this family (parent or child)
      await assertFamilyMember(req, familyId);

      const where: any = { familyId };
      if (userId) {
        where.userId = userId;
      }

      const events = await prisma.historyEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100, // arbitrary cap; bump later if needed
      });

      return res.json(events);
    } catch (err: any) {
      if (err && typeof err === "object" && "status" in err) {
        return res.status(err.status).json({ error: err.error });
      }

      console.error("GET /families/:familyId/history error:", err);
      return res
        .status(500)
        .json({ error: "INTERNAL_SERVER_ERROR" });
    }
  }
);

export default router;
