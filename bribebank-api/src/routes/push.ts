// src/routes/push.ts
import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getPushPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
} from "../controllers/pushController.js";

const router = Router();

// Public: get VAPID public key (no auth needed)
router.get("/public-key", getPushPublicKey);

// Authenticated: register/unregister subscriptions
router.post("/subscribe", authMiddleware, registerPushSubscription);
router.post("/unsubscribe", authMiddleware, unregisterPushSubscription);

export default router;
