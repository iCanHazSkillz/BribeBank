import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getFamilyUsers,
  createUser,
  updateUser,
  updateUserPassword,
  deleteUser,
} from "../controllers/userController.js";

const router = Router();

router.get("/families/:familyId/users", authMiddleware, getFamilyUsers);
router.post("/families/:familyId/users", authMiddleware, createUser);
router.patch("/users/:id", authMiddleware, updateUser);
router.patch("/users/:id/password", authMiddleware, updateUserPassword);
router.delete("/users/:id", authMiddleware, deleteUser);

export default router;
