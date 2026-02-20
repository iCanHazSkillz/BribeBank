import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getFamilyBounties,
  createBounty,
  updateBounty,
  deleteBounty,
  getFamilyBountyAssignments,
  assignBounty,
  acceptAssignedBounty,
  completeAssignedBounty,
  verifyAssignedBounty,
  denyAssignedBounty,
  cancelAssignedBounty,
  pauseBountySeries,
  resumeBountySeries,
  stopBountySeries,
  deleteAssignedBounty,
} from "../controllers/bountyController.js";

const router = Router();

// Bounty templates
router.get("/families/:familyId/bounties",authMiddleware,getFamilyBounties);
router.post("/families/:familyId/bounties",authMiddleware,createBounty);
router.put("/bounties/:id", authMiddleware, updateBounty);
router.delete("/bounties/:id", authMiddleware, deleteBounty);

// Bounty assignments
router.get("/families/:familyId/bounty-assignments",authMiddleware,getFamilyBountyAssignments);
router.post("/families/:familyId/bounty-assignments",authMiddleware,assignBounty);
router.post("/bounty-assignments/:id/accept", authMiddleware, acceptAssignedBounty);
router.post("/bounty-assignments/:id/complete", authMiddleware, completeAssignedBounty);
router.post("/bounty-assignments/:id/verify", authMiddleware, verifyAssignedBounty);
router.post("/bounty-assignments/:id/deny", authMiddleware, denyAssignedBounty);
router.post("/bounty-assignments/:id/cancel", authMiddleware, cancelAssignedBounty);
router.put("/bounty-series/:seriesId/pause", authMiddleware, pauseBountySeries);
router.put("/bounty-series/:seriesId/resume", authMiddleware, resumeBountySeries);
router.put("/bounty-series/:seriesId/stop", authMiddleware, stopBountySeries);
router.delete("/bounty-assignments/:id", authMiddleware, deleteAssignedBounty);

export default router;
