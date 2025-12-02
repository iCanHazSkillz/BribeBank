import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import rewardRoutes from "./routes/rewards.js";
import bountyRoutes from "./routes/bounties.js";
import userRoutes from "./routes/users.js";
import eventsRouter from "./routes/events.js";
import historyRoutes from "./routes/history.js";
import notificationRoutes from "./routes/notifications.js";

const app = express();

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);
app.use(rewardRoutes);
app.use(bountyRoutes);
app.use(userRoutes);
app.use("/events", eventsRouter);
app.use(historyRoutes);
app.use(notificationRoutes);

app.get("/", (_req, res) => {
    res.json({ message: "BribeBank API Online" });
});

app.listen(config.port, () => {
    console.log(`BribeBank API running on port ${config.port}`);
});
