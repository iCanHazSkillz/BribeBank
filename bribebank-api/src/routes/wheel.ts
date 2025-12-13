import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getWheelSegments,
  getWheelConfig,
  updateWheelSegments,
  resetWheelSegments,
  spinWheel,
} from "../controllers/wheelController.js";

const router = Router();

router.get("/families/:familyId/wheel-segments", authMiddleware, getWheelSegments);
router.get("/families/:familyId/wheel-config", authMiddleware, getWheelConfig);
router.put("/families/:familyId/wheel-segments", authMiddleware, updateWheelSegments);
router.post("/families/:familyId/wheel-segments/reset", authMiddleware, resetWheelSegments);
router.post("/families/:familyId/wheel-segments/spin", authMiddleware, spinWheel);

export default router;
