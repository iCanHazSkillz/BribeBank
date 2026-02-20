import { prisma } from "../lib/prisma.js";
import type { Prisma, PrismaClient } from "@prisma/client";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;
const NOTIFICATION_RETENTION_DAYS = 7;
const NOTIFICATION_RETENTION_MS = NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function notificationCutoffDate(now = Date.now()): Date {
  return new Date(now - NOTIFICATION_RETENTION_MS);
}

export async function pruneExpiredNotifications(
  userId: string,
  client: PrismaClientOrTx = prisma
) {
  return client.notification.deleteMany({
    where: {
      userId,
      createdAt: {
        lt: notificationCutoffDate(),
      },
    },
  });
}

export async function addNotification(
  params: {
    userId: string;
    message: string;
  },
  client: PrismaClientOrTx = prisma
) {
  const { userId, message } = params;
  await pruneExpiredNotifications(userId, client);

  return client.notification.create({
    data: {
      userId,
      message,
    },
  });
}

export async function markNotificationRead(id: string) {
  return prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
}

export async function markAllNotificationsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId },
    data: { isRead: true },
  });
}
