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
router.delete("/bounty-assignments/:id", authMiddleware, deleteAssignedBounty);

export default router;
