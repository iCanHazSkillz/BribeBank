import { Request, Response } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { assertFamilyMember, assertParent, getRequestUser } from "../lib/authHelpers.js";
import bcrypt from "bcryptjs";

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-purple-500",
];

function pickAvatarColor(): string {
  const idx = Math.floor(Math.random() * AVATAR_COLORS.length);
  return AVATAR_COLORS[idx];
}

// ---- GET /families/:familyId/users --------------------------

export const getFamilyUsers = async (req: Request, res: Response) => {
  const { familyId } = req.params;
  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }

  try {
    await assertFamilyMember(req, familyId);

    const users = await prisma.user.findMany({
      where: { familyId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        familyId: true,
        username: true,
        displayName: true,
        role: true,
        createdAt: true,
        avatarColor: true,
        ticketBalance: true,
      },
    });

    return res.json(users);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }
    console.error("getFamilyUsers error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// ---- POST /families/:familyId/users -------------------------

export const createUser = async (req: Request, res: Response) => {
  const { familyId } = req.params;
  const { username, password, displayName, role } = req.body;

  if (!familyId) {
    return res.status(400).json({ error: "MISSING_FAMILY_ID" });
  }
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    const requester = await assertFamilyMember(req, familyId);
    assertParent(requester);

    const existing = await prisma.user.findUnique({
      where: { username },
    });
    if (existing) {
      return res.status(400).json({ error: "USERNAME_TAKEN" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const dbRole =
      role === "PARENT" || role === Role.PARENT
        ? Role.PARENT
        : Role.CHILD;

    const user = await prisma.user.create({
      data: {
        familyId,
        username,
        password: hashed,
        displayName,
        role: dbRole,
        avatarColor: pickAvatarColor(),
      },
    });

    return res.status(201).json({
      id: user.id,
      familyId: user.familyId,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    });
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }
    console.error("createUser error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// ---- PATCH /users/:id ---------------------------------------

export const updateUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { username, displayName, role, avatarColor } = req.body;

  if (!id) {
    return res.status(400).json({ error: "MISSING_USER_ID" });
  }

  try {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const requester = await getRequestUser(req);
    if (!requester) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }
    if (requester.familyId !== target.familyId) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const isSelf = requester.id === target.id;
    const isParent = requester.role === Role.PARENT;
    if (!isSelf && !isParent) {
      return res.status(403).json({ error: "PARENT_ONLY" });
    }

    // Optional: lock down who can change avatarColor
    // (right now: self OR parent can change it, same as other fields)

    // Username uniqueness check
    if (username && username !== target.username) {
      const existing = await prisma.user.findUnique({
        where: { username },
      });
      if (existing && existing.id !== target.id) {
        return res.status(400).json({ error: "USERNAME_TAKEN" });
      }
    }

    let dbRole: Role | undefined;
    if (role) {
      dbRole =
        role === "PARENT" || role === Role.PARENT
          ? Role.PARENT
          : Role.CHILD;
    }

    // (Optional but recommended) validate avatarColor against your palette
    const ALLOWED_AVATAR_COLORS = new Set<string>([
      'bg-pink-400',
      'bg-teal-400',
      'bg-blue-500',
      'bg-purple-500',
      'bg-orange-400',
      'bg-green-500',
      'bg-red-400',
      'bg-indigo-500'
    ]);

    let newAvatarColor: string | undefined;
    if (typeof avatarColor === "string") {
      if (!ALLOWED_AVATAR_COLORS.has(avatarColor)) {
        return res
          .status(400)
          .json({ error: "INVALID_AVATAR_COLOR" });
      }
      newAvatarColor = avatarColor;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        username: username ?? target.username,
        displayName: displayName ?? target.displayName,
        role: dbRole ?? target.role,
        // Only send avatarColor if we got one in the request;
        // otherwise Prisma keeps the existing value.
        ...(newAvatarColor !== undefined && {
          avatarColor: newAvatarColor,
        }),
      },
    });

    return res.json({
      id: updated.id,
      familyId: updated.familyId,
      username: updated.username,
      displayName: updated.displayName,
      role: updated.role,
      avatarColor: updated.avatarColor,
    });
  } catch (err: any) {
    console.error("updateUser error:", err);
    return res
      .status(500)
      .json({ error: "INTERNAL_SERVER_ERROR" });
  }
};


// ---- PATCH /users/:id/password ------------------------------

export const updateUserPassword = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!id || !newPassword) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const requester = await getRequestUser(req);
    if (!requester) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }
    if (requester.familyId !== target.familyId) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const isSelf = requester.id === target.id;
    const isParent = requester.role === Role.PARENT;
    if (!isSelf && !isParent) {
      return res.status(403).json({ error: "PARENT_ONLY" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { password: hashed },
    });

    return res.status(204).send();
  } catch (err: any) {
    console.error("updateUserPassword error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// ---- DELETE /users/:id --------------------------------------

export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "MISSING_USER_ID" });
  }

  try {
    // 1) Find the target user
    const target = await prisma.user.findUnique({
      where: { id },
    });

    if (!target) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    // 2) AuthZ: requester must be a parent in the same family
    const requester = await assertFamilyMember(req, target.familyId);
    assertParent(requester);

    // Optional extra safety: never allow backend self-delete
    if (requester.id === target.id) {
      return res.status(400).json({ error: "CANNOT_DELETE_SELF" });
    }

    // 3) Delete dependent rows first, then the user, in a transaction
    await prisma.$transaction([
      prisma.notification.deleteMany({
        where: { userId: id },
      }),
      prisma.historyEvent.deleteMany({
        where: { userId: id },
      }),
      prisma.bountyAssignment.deleteMany({
        where: { userId: id },
      }),
      prisma.assignedPrize.deleteMany({
        where: { userId: id },
      }),
      prisma.claim.deleteMany({
        where: { userId: id },
      }),
      prisma.user.delete({
        where: { id },
      }),
    ]);

    return res.status(204).send();
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      // bubble up assertFamilyMember / assertParent errors
      return res.status(err.status).json({ error: err.error });
    }

    console.error("deleteUser error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};
