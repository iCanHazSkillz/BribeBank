import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "Missing token" });

    const token = header.split(" ")[1];

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
        req.userId = decoded.userId;
        next();
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
};
