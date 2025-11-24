import dotenv from "dotenv";
dotenv.config();

export const config = {
    port: process.env.PORT || 3001,
    jwtSecret: process.env.JWT_SECRET || "",
    databaseUrl: process.env.DATABASE_URL || "",
};
