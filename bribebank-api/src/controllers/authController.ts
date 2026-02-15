import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { Prisma, PrizeType, Role } from "@prisma/client";
import { assertParent, getRequestUser } from "../lib/authHelpers.js";
import { verifyRecoveryKey } from "../lib/recoveryKey.js";
import { rotateFamilyRecoveryKey } from "../services/recoveryService.js";
import {
  AccountDeletionError,
  deleteFamilyCascade,
} from "../services/accountDeletionService.js";

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

// Generate join code
function generateJoinCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function signToken(userId: string, sessionVersion: number) {
    return jwt.sign({ userId, sessionVersion }, config.jwtSecret, { expiresIn: "7d" });
}

const FORGOT_RESET_WINDOW_MS = 10 * 60 * 1000;
const FORGOT_RESET_MAX_ATTEMPTS = 8;
const forgotResetAttempts = new Map<string, { count: number; windowStart: number }>();

function getForgotResetKey(req: Request, username: string) {
  const ip = req.ip || "unknown-ip";
  return `${ip}:${username}`;
}

function isRateLimited(req: Request, normalizedUsername: string): boolean {
  const now = Date.now();
  const key = getForgotResetKey(req, normalizedUsername);
  const current = forgotResetAttempts.get(key);
  if (!current) return false;

  if (now - current.windowStart > FORGOT_RESET_WINDOW_MS) {
    forgotResetAttempts.delete(key);
    return false;
  }

  return current.count >= FORGOT_RESET_MAX_ATTEMPTS;
}

function trackForgotResetFailure(req: Request, normalizedUsername: string) {
  const now = Date.now();
  const key = getForgotResetKey(req, normalizedUsername);
  const current = forgotResetAttempts.get(key);
  if (!current || now - current.windowStart > FORGOT_RESET_WINDOW_MS) {
    forgotResetAttempts.set(key, { count: 1, windowStart: now });
    return;
  }

  forgotResetAttempts.set(key, {
    count: current.count + 1,
    windowStart: current.windowStart,
  });
}

function clearForgotResetAttempts(req: Request, normalizedUsername: string) {
  forgotResetAttempts.delete(getForgotResetKey(req, normalizedUsername));
}

function isPasswordStrongEnough(password: string): boolean {
  return password.length >= 8;
}

const DEMO_REWARDS = [
  {
    title: "Choose Family Movie",
    emoji: "\uD83C\uDFAC",
    description: "You pick tonight's movie for everyone.",
    type: PrizeType.ACTIVITY,
    themeColor: "bg-blue-100 text-blue-800 border-blue-200",
  },
  {
    title: "Dessert Pass",
    emoji: "\uD83C\uDF68",
    description: "Pick a dessert for after dinner.",
    type: PrizeType.FOOD,
    themeColor: "bg-pink-100 text-pink-800 border-pink-200",
  },
  {
    title: "30 Minutes Extra Screen Time",
    emoji: "\uD83D\uDCF1",
    description: "Redeem for an extra 30 minutes of screen time.",
    type: PrizeType.PRIVILEGE,
    themeColor: "bg-purple-100 text-purple-800 border-purple-200",
  },
];

const DEMO_BOUNTIES = [
  {
    title: "After-Dinner Kitchen Reset",
    emoji: "\uD83C\uDF7D\uFE0F",
    rewardType: "TICKETS",
    rewardValue: "25",
    isFCFS: false,
    requiresPhoto: false,
    deadlineHours: 24,
    themeColor: "bg-amber-100 text-amber-800 border-amber-200",
  },
  {
    title: "Laundry Fold + Put Away",
    emoji: "\uD83E\uDDFA",
    rewardType: "CUSTOM",
    rewardValue: "Pick Friday Dessert",
    isFCFS: false,
    requiresPhoto: true,
    deadlineHours: null,
    themeColor: "bg-teal-100 text-teal-800 border-teal-200",
  },
  {
    title: "Take Out Recycling (Fast Grab)",
    emoji: "\u267B\uFE0F",
    rewardType: "CUSTOM",
    rewardValue: "15 extra minutes of gaming",
    isFCFS: true,
    requiresPhoto: false,
    deadlineHours: null,
    themeColor: "bg-green-100 text-green-800 border-green-200",
  },
];

const DEMO_WHEEL_SEGMENTS_BALANCED = [
  { label: "30 Min Screen Time", color: "#60A5FA", prob: 1 / 6 },
  { label: "Try Again", color: "#9CA3AF", prob: 1 / 6 },
  { label: "Dessert Upgrade", color: "#F472B6", prob: 1 / 6 },
  { label: "Try Again", color: "#9CA3AF", prob: 1 / 6 },
  { label: "$5 Bonus Allowance", color: "#34D399", prob: 1 / 6 },
  { label: "Try Again", color: "#9CA3AF", prob: 1 / 6 },
];

// -----------------------------------------------------
// PARENT REGISTRATION
// -----------------------------------------------------
export const registerParent = async (req: Request, res: Response) => {
  console.log("⚡ registerParent hit");
  console.log("req.body =", req.body);

  try {
    const { username, password, displayName, familyName } = req.body as {
      username?: string;
      password?: string;
      displayName?: string;
      familyName?: string;
    };

    if (!username || !password || !displayName || !familyName) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }

    const normalizedUsername = username.trim().toLowerCase();

    console.log("Hashing password...");
    const hashed = await bcrypt.hash(password, 10);

    console.log("Generating join code...");
    const joinCode = generateJoinCode();

    const { family, user } = await prisma.$transaction(async (tx) => {
      console.log("Creating family...");
      const family = await tx.family.create({
        data: {
          name: familyName,
          joinCode,
          joinCodeExpiry: new Date(Date.now() + 86400000),
        },
      });

      console.log("Creating user...");
      const user = await tx.user.create({
        data: {
          familyId: family.id,
          username: normalizedUsername, // canonical lowercase
          password: hashed,
          displayName,
          role: "PARENT",
          avatarColor: pickAvatarColor(),
        },
      });

      // Seed starter content for first-run family experience.
      await tx.reward.createMany({
        data: DEMO_REWARDS.map((reward) => ({
          familyId: family.id,
          title: reward.title,
          emoji: reward.emoji,
          description: reward.description,
          type: reward.type,
          themeColor: reward.themeColor,
        })),
      });

      await tx.bounty.createMany({
        data: DEMO_BOUNTIES.map((bounty) => ({
          familyId: family.id,
          title: bounty.title,
          emoji: bounty.emoji,
          rewardType: bounty.rewardType,
          rewardValue: bounty.rewardValue,
          isFCFS: bounty.isFCFS,
          requiresPhoto: bounty.requiresPhoto,
          deadlineHours: bounty.deadlineHours,
          themeColor: bounty.themeColor,
        })),
      });

      for (const segment of DEMO_WHEEL_SEGMENTS_BALANCED) {
        await tx.wheelSegment.create({
          data: {
            familyId: family.id,
            label: segment.label,
            color: segment.color,
            prob: segment.prob,
          },
        });
      }

      return { family, user };
    });

    console.log("✔ Success");

    return res.json({
      message: "Parent account created",
      token: signToken(user.id, user.sessionVersion),
      joinCode,
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint violation on username
      if (err.code === "P2002") {
        return res.status(409).json({ error: "USERNAME_TAKEN" });
      }
    }

    console.error("Unhandled error in registerParent:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};



// -----------------------------------------------------
// LOGIN
// -----------------------------------------------------
export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return res.status(400).json({ error: "MISSING_CREDENTIALS" });
    }

    const normalizedUsername = username.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername }, // <-- field is `username`
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    return res.json({
      token: signToken(user.id, user.sessionVersion),
    });
  } catch (err) {
    console.error("login error:", err);
    return res.status(400).json({ error: "Login failed" });
  }
};


// -----------------------------------------------------
// CHILD JOIN
// -----------------------------------------------------
export const joinFamily = async (req: Request, res: Response) => {
  try {
    const { joinCode, username, password, displayName } = req.body as {
      joinCode?: string;
      username?: string;
      password?: string;
      displayName?: string;
    };

    if (!joinCode || !username || !password || !displayName) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }

    const normalizedJoinCode = joinCode.trim().toUpperCase();
    const normalizedUsername = username.trim().toLowerCase();

    const family = await prisma.family.findFirst({
      where: {
        joinCode: normalizedJoinCode,
        joinCodeExpiry: { gt: new Date() },
      },
    });

    if (!family) {
      return res
        .status(400)
        .json({ error: "Invalid or expired join code" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        familyId: family.id,
        username: normalizedUsername, // <-- canonical lowercase
        password: hashed,
        displayName,
        role: "CHILD",
        avatarColor: pickAvatarColor(),
      },
    });

    return res.json({
      message: "Child account created",
      token: signToken(user.id, user.sessionVersion),
      familyName: family.name,
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        // unique constraint violation (likely username)
        return res.status(409).json({ error: "USERNAME_TAKEN" });
      }
    }

    console.error("joinFamily error:", err);
    return res.status(400).json({ error: "Child registration failed" });
  }
};

// -----------------------------------------------------
// REGENERATE CODE
// -----------------------------------------------------
export const regenerateCode = async (req: Request, res: Response) => {
    try {
        if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

        const user = await prisma.user.findUnique({
            where: { id: req.userId },
        });

        if (!user || user.role !== "PARENT") {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const newCode = generateJoinCode();

        const family = await prisma.family.update({
            where: { id: user.familyId },
            data: {
                joinCode: newCode,
                joinCodeExpiry: new Date(Date.now() + 1000 * 60 * 60 * 24),
            },
        });

        return res.json({
            joinCode: family.joinCode,
            expires: family.joinCodeExpiry,
        });
    } catch {
        return res.status(400).json({ error: "Failed to regenerate code" });
    }
};

// -----------------------------------------------------
// ME
// -----------------------------------------------------
export const getMe = async (req: Request, res: Response) => {
    try {
        if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: {
                id: true,
                familyId: true,
                username: true,
                displayName: true,
                role: true,
                avatarColor: true,
                avatarUrl: true,
                ticketBalance: true,
                family: {
                    select: { id: true, name: true, joinCode: true, joinCodeExpiry: true },
                },
            },
        });

        return res.json(user);
    } catch {
        return res.status(400).json({ error: "Failed" });
    }
};

// -----------------------------------------------------
// RECOVERY KEY STATUS (PARENT ONLY)
// -----------------------------------------------------
export const getRecoveryKeyStatus = async (req: Request, res: Response) => {
  try {
    const requester = await getRequestUser(req);
    if (!requester) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }
    assertParent(requester);

    const family = await prisma.family.findUnique({
      where: { id: requester.familyId },
      select: {
        passwordRecoveryKeyHash: true,
        passwordRecoveryKeyUpdatedAt: true,
      },
    });

    if (!family) {
      return res.status(404).json({ error: "FAMILY_NOT_FOUND" });
    }

    return res.json({
      configured: !!family.passwordRecoveryKeyHash,
      updatedAt: family.passwordRecoveryKeyUpdatedAt,
    });
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }
    console.error("getRecoveryKeyStatus error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// -----------------------------------------------------
// REGENERATE RECOVERY KEY (PARENT ONLY)
// -----------------------------------------------------
export const regenerateRecoveryKey = async (req: Request, res: Response) => {
  try {
    const requester = await getRequestUser(req);
    if (!requester) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }
    assertParent(requester);

    const { recoveryKey, updatedAt } = await rotateFamilyRecoveryKey(
      requester.familyId
    );

    return res.json({
      recoveryKey,
      updatedAt,
    });
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }
    console.error("regenerateRecoveryKey error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// -----------------------------------------------------
// DELETE CURRENT FAMILY (PARENT ONLY)
// -----------------------------------------------------
export const deleteCurrentFamily = async (req: Request, res: Response) => {
  try {
    const requester = await getRequestUser(req);
    if (!requester) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }
    assertParent(requester);

    await deleteFamilyCascade(requester.familyId, {
      source: "APP_USER",
      actorUserId: requester.id,
    });

    return res.status(204).send();
  } catch (err: any) {
    if (err instanceof AccountDeletionError) {
      return res.status(err.status).json({ error: err.code });
    }
    if (err && typeof err === "object" && "status" in err) {
      return res.status(err.status).json({ error: err.error });
    }
    console.error("deleteCurrentFamily error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// -----------------------------------------------------
// FORGOT PASSWORD RESET (PUBLIC)
// -----------------------------------------------------
export const resetForgottenPassword = async (req: Request, res: Response) => {
  try {
    const { username, recoveryKey, newPassword } = req.body as {
      username?: string;
      recoveryKey?: string;
      newPassword?: string;
    };

    if (!username || !recoveryKey || !newPassword) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }
    if (!isPasswordStrongEnough(newPassword)) {
      return res.status(400).json({ error: "WEAK_PASSWORD" });
    }

    const normalizedUsername = username.trim().toLowerCase();
    if (isRateLimited(req, normalizedUsername)) {
      return res.status(429).json({ error: "TOO_MANY_ATTEMPTS" });
    }

    const invalidResponse = () =>
      res.status(400).json({ error: "INVALID_RECOVERY_CREDENTIALS" });

    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: {
        id: true,
        familyId: true,
        role: true,
      },
    });

    if (!user || user.role !== Role.PARENT) {
      trackForgotResetFailure(req, normalizedUsername);
      return invalidResponse();
    }

    const family = await prisma.family.findUnique({
      where: { id: user.familyId },
      select: {
        passwordRecoveryKeyHash: true,
      },
    });

    const validKey = await verifyRecoveryKey(
      recoveryKey.trim().toUpperCase(),
      family?.passwordRecoveryKeyHash
    );
    if (!validKey) {
      trackForgotResetFailure(req, normalizedUsername);
      return invalidResponse();
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const { recoveryKey: newRecoveryKey, updatedAt } =
      await rotateFamilyRecoveryKey(user.familyId);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        sessionVersion: { increment: 1 },
      },
    });

    clearForgotResetAttempts(req, normalizedUsername);

    return res.json({
      message: "PASSWORD_RESET_SUCCESS",
      newRecoveryKey,
      rotatedAt: updatedAt,
    });
  } catch (err) {
    console.error("resetForgottenPassword error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};
