import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";

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

function signToken(userId: string) {
    return jwt.sign({ userId }, config.jwtSecret, { expiresIn: "7d" });
}

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

    console.log("Creating family...");
    const family = await prisma.family.create({
      data: {
        name: familyName,
        joinCode,
        joinCodeExpiry: new Date(Date.now() + 86400000),
      },
    });

    console.log("Creating user...");
    const user = await prisma.user.create({
      data: {
        familyId: family.id,
        username: normalizedUsername,      // <-- canonical lowercase
        password: hashed,
        displayName,
        role: "PARENT",
        avatarColor: pickAvatarColor(),
      },
    });

    console.log("✔ Success");

    return res.json({
      message: "Parent account created",
      token: signToken(user.id),
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
      token: signToken(user.id),
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
      token: signToken(user.id),
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
                username: true,
                displayName: true,
                role: true,
                avatarColor: true,
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
