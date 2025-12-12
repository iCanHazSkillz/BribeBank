import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getFamilyStoreItems,
  createStoreItem,
  updateStoreItem,
  deleteStoreItem,
  purchaseStoreItem,
} from "../controllers/storeController.js";

const router = Router();

// Store item CRUD
router.get("/families/:familyId/store-items", authMiddleware, getFamilyStoreItems);
router.post("/families/:familyId/store-items", authMiddleware, createStoreItem);
router.put("/store-items/:id", authMiddleware, updateStoreItem);
router.delete("/store-items/:id", authMiddleware, deleteStoreItem);

// Purchase action
router.post("/store-items/:id/purchase", authMiddleware, purchaseStoreItem);

export default router;
