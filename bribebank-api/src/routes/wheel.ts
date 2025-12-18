import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getWheelSegments,
  getWheelConfig,
  updateWheelSegments,
  resetWheelSegments,
  spinWheel,
  updateTicketConversionRate,
} from "../controllers/wheelController.js";

const router = Router();

router.get("/families/:familyId/wheel-segments", authMiddleware, getWheelSegments);
router.get("/families/:familyId/wheel-config", authMiddleware, getWheelConfig);
router.put("/families/:familyId/wheel-segments", authMiddleware, updateWheelSegments);
router.post("/families/:familyId/wheel-segments/reset", authMiddleware, resetWheelSegments);
router.post("/families/:familyId/wheel-segments/spin", authMiddleware, spinWheel);
router.put("/families/:familyId/ticket-conversion-rate", authMiddleware, updateTicketConversionRate);

export default router;
