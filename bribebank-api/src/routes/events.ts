// src/routes/events.ts
import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { addClient, removeClient } from "../realtime/eventBus.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

interface JwtPayload {
  userId: string;
  sessionVersion?: number;
  iat: number;
  exp: number;
}

// GET /events?token=JWT
router.get("/", async (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;
  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  if (typeof decoded.sessionVersion !== "number") {
    return res.status(401).json({ error: "SESSION_STALE" });
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, familyId: true, sessionVersion: true },
  });

  if (!user || !user.familyId) {
    return res.status(403).json({ error: "User has no family" });
  }
  if (user.sessionVersion !== decoded.sessionVersion) {
    return res.status(401).json({ error: "SESSION_STALE" });
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.(); // works if you're using compression/express 4.17+ etc.

  // register client
  const clientId = addClient(user.familyId, res);

  // send an initial "connected" ping
  res.write(`data: ${JSON.stringify({ type: "CONNECTED" })}\n\n`);

  // keep-alive every 25s to stop proxies closing the connection
  const keepAlive = setInterval(() => {
    try {
      res.write(`:keepalive\n\n`); // SSE comment line
    } catch {
      clearInterval(keepAlive);
      removeClient(clientId);
    }
  }, 25_000);

  // cleanup
  req.on("close", () => {
    clearInterval(keepAlive);
    removeClient(clientId);
  });
});

export default router;
