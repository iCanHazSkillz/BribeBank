import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getFamilyRewards,
  createReward,
  updateReward,
  deleteReward,
  getFamilyAssignedPrizes,
  assignPrize,
  claimAssignedPrize,
  approveAssignedPrize,
  rejectAssignedPrize,
  deleteAssignedPrize,
} from "../controllers/rewardController.js";

const router = Router();

// Reward templates
router.get("/families/:familyId/rewards", authMiddleware, getFamilyRewards);
router.post("/families/:familyId/rewards", authMiddleware, createReward);
router.put("/rewards/:id", authMiddleware, updateReward);
router.delete("/rewards/:id", authMiddleware, deleteReward);

// Assigned prizes
router.get(
  "/families/:familyId/assigned-prizes",
  authMiddleware,
  getFamilyAssignedPrizes
);
router.post(
  "/families/:familyId/assigned-prizes",
  authMiddleware,
  assignPrize
);
router.post(
  "/assigned-prizes/:id/claim",
  authMiddleware,
  claimAssignedPrize
);
router.post(
  "/assigned-prizes/:id/approve",
  authMiddleware,
  approveAssignedPrize
);
router.post(
  "/assigned-prizes/:id/reject",
  authMiddleware,
  rejectAssignedPrize
);
router.delete(
  "/assigned-prizes/:id",
  authMiddleware,
  deleteAssignedPrize
);

export default router;
