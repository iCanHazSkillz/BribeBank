import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { giveTickets, getTicketBalance } from "../controllers/ticketController.js";

const router = Router();

router.post("/users/:userId/tickets", authMiddleware, giveTickets);
router.get("/users/:userId/tickets", authMiddleware, getTicketBalance);

export default router;
