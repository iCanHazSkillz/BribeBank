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

const app = express();

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

app.use(helmet());
app.use(cors({
  origin: [
    'https://bribebank.homeflixlab.com',
    'http://localhost:3000',  // Keep for local dev
    'null'  // TWA may send null origin
  ],
  credentials: true
}));
app.use(express.json({ limit: '25mb' })); // Increased limit for base64 images (avatars + task photos)

// Digital Asset Links for TWA verification
app.get('/.well-known/assetlinks.json', (_req, res) => {
  res.json([{
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.bribebank.app",
      "sha256_cert_fingerprints": [
        "PLACEHOLDER_WILL_BE_GENERATED_BY_BUBBLEWRAP"
      ]
    }
  }]);
});

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
});
