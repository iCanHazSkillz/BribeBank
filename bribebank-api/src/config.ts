import dotenv from "dotenv";
dotenv.config();

export const config = {
    port: process.env.PORT || 3001,
    jwtSecret: process.env.JWT_SECRET || "",
    databaseUrl: process.env.DATABASE_URL || "",
    webauthnRpId: process.env.WEBAUTHN_RP_ID || "localhost",
    webauthnOrigin: process.env.WEBAUTHN_ORIGIN || "http://localhost:5173",
    webauthnRpName: process.env.WEBAUTHN_RP_NAME || "BribeBank",
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS || "",
};
