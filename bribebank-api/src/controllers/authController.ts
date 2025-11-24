import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

const prisma = new PrismaClient();

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
    console.log("Hashing password...");
    const hashed = await bcrypt.hash(req.body.password, 10);

    console.log("Generating join code...");
    const joinCode = generateJoinCode();

    console.log("Creating family...");
    const family = await prisma.family.create({
      data: {
        name: req.body.familyName,
        joinCode,
        joinCodeExpiry: new Date(Date.now() + 86400000),
      },
    });

    console.log("Creating user...");
    const user = await prisma.user.create({
      data: {
        familyId: family.id,
        username: req.body.username,
        password: hashed,
        displayName: req.body.displayName,
        role: "PARENT",
      },
    });

    console.log("✔ Success");

    return res.json({
      message: "Parent account created",
      token: signToken(user.id),
      joinCode,
    });

  } catch (err: unknown) {
    // Proper narrowing
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint violation
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
        const { username, password } = req.body;

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return res.status(400).json({ error: "Invalid credentials" });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: "Invalid credentials" });

        return res.json({
            token: signToken(user.id),
        });
    } catch {
        return res.status(400).json({ error: "Login failed" });
    }
};

// -----------------------------------------------------
// CHILD JOIN
// -----------------------------------------------------
export const joinFamily = async (req: Request, res: Response) => {
    try {
        const { joinCode, username, password, displayName } = req.body;

        const family = await prisma.family.findFirst({
            where: {
                joinCode,
                joinCodeExpiry: { gt: new Date() },
            },
        });

        if (!family)
            return res.status(400).json({ error: "Invalid or expired join code" });

        const hashed = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                familyId: family.id,
                username,
                password: hashed,
                displayName,
                role: "CHILD",
            },
        });

        return res.json({
            message: "Child account created",
            token: signToken(user.id),
            familyName: family.name,
        });
    } catch {
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
                family: {
                    select: { name: true, joinCode: true, joinCodeExpiry: true },
                },
            },
        });

        return res.json(user);
    } catch {
        return res.status(400).json({ error: "Failed" });
    }
};
