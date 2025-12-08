// src/controllers/pushController.ts
import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export const getPushPublicKey = (req: Request, res: Response) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(500).json({ error: "PUSH_NOT_CONFIGURED" });
  }
  return res.json({ publicKey });
};

export const registerPushSubscription = async (req: Request, res: Response) => {
  const userId = req.userId; // relies on authMiddleware setting this

  if (!userId) {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }

  const { endpoint, keys } = req.body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "INVALID_SUBSCRIPTION" });
  }

  const userAgent =
    (req.headers["user-agent"] as string | undefined) ?? null;

  // Upsert by endpoint so we don't create duplicates
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
  });

  if (existing) {
    const updated = await prisma.pushSubscription.update({
      where: { id: existing.id },
      data: { userId, userAgent },
    });
    return res.status(200).json({ id: updated.id });
  }

  const created = await prisma.pushSubscription.create({
    data: {
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
    },
  });

  return res.status(201).json({ id: created.id });
};

export const unregisterPushSubscription = async (
  req: Request,
  res: Response
) => {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }

  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: "MISSING_ENDPOINT" });
  }

  await prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  });

  return res.status(204).send();
};
