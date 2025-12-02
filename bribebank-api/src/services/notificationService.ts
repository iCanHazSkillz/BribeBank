import { prisma } from "../lib/prisma.js";
import type { Prisma, PrismaClient } from "@prisma/client";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export async function addNotification(
  params: {
    userId: string;
    message: string;
  },
  client: PrismaClientOrTx = prisma
) {
  const { userId, message } = params;

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
