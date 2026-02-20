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
import pushRoutes from "./routes/push.js";
import ticketRoutes from "./routes/tickets.js";
import storeItemRoutes from "./routes/storeItems.js";
import wheelRoutes from "./routes/wheel.js";
import templateRoutes from "./routes/templates.js";
import { startDeadlineMonitoring } from "./services/deadlineMonitor.js";
import { startRecurrenceMonitoring } from "./services/recurrenceMonitor.js";

const app = express();

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

app.use(helmet());
const DEFAULT_ALLOWED_ORIGINS = [
  "https://bribebank.homeflixlab.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "null",
];

const envAllowedOrigins = config.corsAllowedOrigins
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...envAllowedOrigins]);

const LAN_ORIGIN_REGEX =
  /^https?:\/\/((192\.168\.\d{1,3}\.\d{1,3})|(10\.\d{1,3}\.\d{1,3}\.\d{1,3})|(172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}))(?::\d+)?$/;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser or same-origin requests with no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin) || LAN_ORIGIN_REGEX.test(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '25mb' })); // Increased limit for base64 images (avatars + task photos)
app.use("/auth", authRoutes);
app.use(rewardRoutes);
app.use(bountyRoutes);
app.use(userRoutes);
app.use("/events", eventsRouter);
app.use(historyRoutes);
app.use(notificationRoutes);
app.use("/push", pushRoutes);
app.use(ticketRoutes);
app.use(storeItemRoutes);
app.use(wheelRoutes);
app.use("/templates", templateRoutes);

app.get("/", (_req, res) => {
    res.json({ message: "BribeBank API Online" });
});

app.listen(config.port, () => {
    console.log(`BribeBank API running on port ${config.port}`);
    
    // Start deadline monitoring service
    startDeadlineMonitoring();
    startRecurrenceMonitoring();
});
