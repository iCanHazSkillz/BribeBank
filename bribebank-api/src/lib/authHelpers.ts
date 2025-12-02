import type { Request } from "express";
import { Role } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function getRequestUser(req: Request) {
  if (!req.userId) return null;
  return prisma.user.findUnique({ where: { id: req.userId } });
}

export async function assertFamilyMember(req: Request, familyId: string) {
  const user = await getRequestUser(req);

  console.log("[assertFamilyMember] req.userId:", req.userId,
              "param familyId:", familyId,
              "db user.familyId:", user?.familyId);

  if (!user) {
    throw { status: 401, error: "UNAUTHENTICATED" as const };
  }
  if (user.familyId !== familyId) {
    throw { status: 403, error: "FORBIDDEN" as const };
  }
  return user;
}

export function assertParent(user: { role: Role }) {
  if (user.role !== Role.PARENT) {
    throw { status: 403, error: "PARENT_ONLY" as const };
  }
}
