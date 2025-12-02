import { prisma } from "../lib/prisma.js";
import type { Prisma, PrismaClient } from "@prisma/client";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export async function addHistoryEvent(
  params: {
    familyId: string;
    userId: string;
    userName: string;
    emoji: string;
    title: string;
    action: string;
    assignerName: string;
  },
  client: PrismaClientOrTx = prisma
) {
  const { familyId, userId, userName, emoji, title, action, assignerName } =
    params;

  return client.historyEvent.create({
    data: {
      familyId,
      userId,
      userName,
      emoji,
      title,
      action,
      assignerName,
    },
  });
}
