import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";

type AuthJwtPayload = {
    userId?: string;
    sessionVersion?: number;
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "Missing token" });

    const token = header.split(" ")[1];

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as AuthJwtPayload;
        if (!decoded.userId || typeof decoded.sessionVersion !== "number") {
            return res.status(401).json({ error: "SESSION_STALE" });
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, sessionVersion: true },
        });

        if (!user || user.sessionVersion !== decoded.sessionVersion) {
            return res.status(401).json({ error: "SESSION_STALE" });
        }

        req.userId = decoded.userId;
        next();
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
};
