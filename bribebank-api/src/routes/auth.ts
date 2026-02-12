import { Router } from "express";
import {
    registerParent,
    login,
    joinFamily,
    regenerateCode,
    getMe,
    getRecoveryKeyStatus,
    regenerateRecoveryKey,
    resetForgottenPassword
} from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register-parent", registerParent);
router.post("/login", login);
router.post("/join-family", joinFamily);
router.post("/regenerate-code", authMiddleware, regenerateCode);
router.get("/me", authMiddleware, getMe);
router.get("/recovery-key/status", authMiddleware, getRecoveryKeyStatus);
router.post("/recovery-key/regenerate", authMiddleware, regenerateRecoveryKey);
router.post("/forgot-password/reset", resetForgottenPassword);

export default router;
