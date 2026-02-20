import { Router } from "express";
import {
    registerParent,
    login,
    joinFamily,
    regenerateCode,
    getMe,
    getRecoveryKeyStatus,
    regenerateRecoveryKey,
    resetForgottenPassword,
    deleteCurrentFamily
} from "../controllers/authController.js";
import {
  createDeviceToken,
  getCurrentDeviceTokenStatus,
  getPasskeyAuthOptions,
  getPasskeyRegisterOptions,
  getQuickLoginStatus,
  listPasskeys,
  loginWithDeviceToken,
  markQuickLoginPromptSeen,
  removePasskey,
  revokeCurrentDeviceToken,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
} from "../controllers/quickLoginController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register-parent", registerParent);
router.post("/login", login);
router.post("/join-family", joinFamily);
router.post("/regenerate-code", authMiddleware, regenerateCode);
router.get("/me", authMiddleware, getMe);
router.get("/recovery-key/status", authMiddleware, getRecoveryKeyStatus);
router.post("/recovery-key/regenerate", authMiddleware, regenerateRecoveryKey);
router.delete("/family", authMiddleware, deleteCurrentFamily);
router.post("/forgot-password/reset", resetForgottenPassword);

router.get("/quick-login/status", authMiddleware, getQuickLoginStatus);
router.post("/quick-login/prompt-seen", authMiddleware, markQuickLoginPromptSeen);

router.post("/passkeys/register/options", authMiddleware, getPasskeyRegisterOptions);
router.post("/passkeys/register/verify", authMiddleware, verifyPasskeyRegistration);
router.get("/passkeys", authMiddleware, listPasskeys);
router.delete("/passkeys/:id", authMiddleware, removePasskey);
router.post("/passkeys/authenticate/options", getPasskeyAuthOptions);
router.post("/passkeys/authenticate/verify", verifyPasskeyAuthentication);

router.post("/device-token/create", authMiddleware, createDeviceToken);
router.post("/device-token/login", loginWithDeviceToken);
router.get("/device-token/current/status", authMiddleware, getCurrentDeviceTokenStatus);
router.delete("/device-token/current", authMiddleware, revokeCurrentDeviceToken);

export default router;
