import crypto from "crypto";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { AuthChallengeType } from "@prisma/client";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function signToken(userId: string, sessionVersion: number) {
  return jwt.sign({ userId, sessionVersion }, config.jwtSecret, { expiresIn: "7d" });
}

function nowPlus(ms: number) {
  return new Date(Date.now() + ms);
}

function getDeviceKeyId(req: Request): string | null {
  const raw = req.headers["x-device-key-id"];
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return null;
}

function hashDeviceToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseTransports(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((v) => typeof v === "string");
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function getAuthedUser(req: Request) {
  if (!req.userId) return null;
  return prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      sessionVersion: true,
      username: true,
      displayName: true,
      quickLoginPromptSeenAt: true,
    },
  });
}

// GET /auth/quick-login/status
export const getQuickLoginStatus = async (req: Request, res: Response) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const [passkeyCount, deviceTokenCount] = await Promise.all([
      prisma.passkeyCredential.count({
        where: { userId: user.id },
      }),
      prisma.authDeviceToken.count({
        where: {
          userId: user.id,
          revokedAt: null,
        },
      }),
    ]);

    const hasPasskey = passkeyCount > 0;
    const hasDeviceTokenMethod = deviceTokenCount > 0;
    const setupPromptSeen = !!user.quickLoginPromptSeenAt;

    return res.json({
      hasPasskey,
      hasDeviceTokenMethod,
      setupPromptSeen,
      needsInitialSetupPrompt: !hasPasskey && !hasDeviceTokenMethod && !setupPromptSeen,
    });
  } catch (err) {
    console.error("getQuickLoginStatus error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// POST /auth/quick-login/prompt-seen
export const markQuickLoginPromptSeen = async (req: Request, res: Response) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        quickLoginPromptSeenAt: new Date(),
      },
    });

    return res.status(204).send();
  } catch (err) {
    console.error("markQuickLoginPromptSeen error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// POST /auth/passkeys/register/options
export const getPasskeyRegisterOptions = async (req: Request, res: Response) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const existingPasskeys = await prisma.passkeyCredential.findMany({
      where: { userId: user.id },
      select: { credentialId: true },
    });

    const options = await generateRegistrationOptions({
      rpName: config.webauthnRpName,
      rpID: config.webauthnRpId,
      userName: user.username,
      userID: new TextEncoder().encode(user.id),
      userDisplayName: user.displayName,
      timeout: 60000,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      excludeCredentials: existingPasskeys.map((p) => ({
        id: p.credentialId,
        type: "public-key",
      })),
    });

    const challengeRow = await prisma.authChallenge.create({
      data: {
        userId: user.id,
        type: AuthChallengeType.PASSKEY_REGISTER,
        challenge: options.challenge,
        expiresAt: nowPlus(CHALLENGE_TTL_MS),
      },
    });

    return res.json({
      challengeId: challengeRow.id,
      options,
    });
  } catch (err) {
    console.error("getPasskeyRegisterOptions error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// POST /auth/passkeys/register/verify
export const verifyPasskeyRegistration = async (req: Request, res: Response) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const { challengeId, response } = req.body as {
      challengeId?: string;
      response?: Record<string, unknown>;
    };

    if (!challengeId || !response) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }

    const challenge = await prisma.authChallenge.findUnique({
      where: { id: challengeId },
    });

    if (
      !challenge ||
      challenge.userId !== user.id ||
      challenge.type !== AuthChallengeType.PASSKEY_REGISTER ||
      challenge.usedAt ||
      challenge.expiresAt.getTime() < Date.now()
    ) {
      return res.status(400).json({ error: "INVALID_CHALLENGE" });
    }

    const verification = await verifyRegistrationResponse({
      response: response as any,
      expectedChallenge: challenge.challenge,
      expectedOrigin: config.webauthnOrigin,
      expectedRPID: config.webauthnRpId,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: "PASSKEY_REGISTRATION_FAILED" });
    }

    const registrationInfo = verification.registrationInfo;
    const credentialId = registrationInfo.credentialID;
    const existing = await prisma.passkeyCredential.findUnique({
      where: { credentialId },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({ error: "PASSKEY_ALREADY_REGISTERED" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.authChallenge.update({
        where: { id: challenge.id },
        data: { usedAt: new Date() },
      });

      await tx.passkeyCredential.create({
        data: {
          userId: user.id,
          credentialId,
          publicKey: Buffer.from(registrationInfo.credentialPublicKey).toString("base64"),
          counter: registrationInfo.counter,
          transports: JSON.stringify(
            ((response as any)?.response?.transports ?? []) as string[]
          ),
          aaguid: registrationInfo.aaguid || null,
        },
      });
    });

    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("verifyPasskeyRegistration error:", err);
    return res.status(400).json({ error: "PASSKEY_REGISTRATION_FAILED" });
  }
};

// GET /auth/passkeys
export const listPasskeys = async (req: Request, res: Response) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const passkeys = await prisma.passkeyCredential.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        transports: true,
      },
    });

    return res.json(
      passkeys.map((p) => ({
        id: p.id,
        createdAt: p.createdAt,
        lastUsedAt: p.lastUsedAt,
        transports: parseTransports(p.transports) || [],
      }))
    );
  } catch (err) {
    console.error("listPasskeys error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// DELETE /auth/passkeys/:id
export const removePasskey = async (req: Request, res: Response) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "MISSING_PASSKEY_ID" });
    }

    const passkeys = await prisma.passkeyCredential.findMany({
      where: { userId: user.id },
      select: { id: true },
    });

    const own = passkeys.find((p) => p.id === id);
    if (!own) {
      return res.status(404).json({ error: "PASSKEY_NOT_FOUND" });
    }

    if (passkeys.length <= 1) {
      return res.status(400).json({ error: "CANNOT_REMOVE_LAST_PASSKEY" });
    }

    await prisma.passkeyCredential.delete({
      where: { id },
    });

    return res.status(204).send();
  } catch (err) {
    console.error("removePasskey error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// POST /auth/passkeys/authenticate/options
export const getPasskeyAuthOptions = async (_req: Request, res: Response) => {
  try {
    const options = await generateAuthenticationOptions({
      rpID: config.webauthnRpId,
      timeout: 60000,
      userVerification: "required",
      allowCredentials: [],
    });

    const challengeRow = await prisma.authChallenge.create({
      data: {
        userId: null,
        type: AuthChallengeType.PASSKEY_AUTH,
        challenge: options.challenge,
        expiresAt: nowPlus(CHALLENGE_TTL_MS),
      },
    });

    return res.json({
      challengeId: challengeRow.id,
      options,
    });
  } catch (err) {
    console.error("getPasskeyAuthOptions error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// POST /auth/passkeys/authenticate/verify
export const verifyPasskeyAuthentication = async (req: Request, res: Response) => {
  try {
    const { challengeId, response } = req.body as {
      challengeId?: string;
      response?: Record<string, unknown>;
    };

    if (!challengeId || !response) {
      return res.status(400).json({ error: "MISSING_FIELDS" });
    }

    const challenge = await prisma.authChallenge.findUnique({
      where: { id: challengeId },
    });

    if (
      !challenge ||
      challenge.type !== AuthChallengeType.PASSKEY_AUTH ||
      challenge.usedAt ||
      challenge.expiresAt.getTime() < Date.now()
    ) {
      return res.status(400).json({ error: "INVALID_CHALLENGE" });
    }

    const credentialId = (response as any)?.id as string | undefined;
    if (!credentialId) {
      return res.status(400).json({ error: "INVALID_ASSERTION" });
    }

    const passkey = await prisma.passkeyCredential.findUnique({
      where: { credentialId },
      include: {
        user: {
          select: {
            id: true,
            sessionVersion: true,
          },
        },
      },
    });

    if (!passkey) {
      return res.status(400).json({ error: "PASSKEY_NOT_FOUND" });
    }

    const verification = await verifyAuthenticationResponse({
      response: response as any,
      expectedChallenge: challenge.challenge,
      expectedOrigin: config.webauthnOrigin,
      expectedRPID: config.webauthnRpId,
      requireUserVerification: true,
      authenticator: {
        credentialID: passkey.credentialId,
        credentialPublicKey: Buffer.from(passkey.publicKey, "base64"),
        counter: passkey.counter,
        transports: parseTransports(passkey.transports) as any,
      },
    });

    if (!verification.verified) {
      return res.status(400).json({ error: "PASSKEY_AUTH_FAILED" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.authChallenge.update({
        where: { id: challenge.id },
        data: { usedAt: new Date() },
      });
      await tx.passkeyCredential.update({
        where: { id: passkey.id },
        data: {
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: new Date(),
        },
      });
    });

    return res.json({
      token: signToken(passkey.user.id, passkey.user.sessionVersion),
    });
  } catch (err) {
    console.error("verifyPasskeyAuthentication error:", err);
    return res.status(400).json({ error: "PASSKEY_AUTH_FAILED" });
  }
};

// POST /auth/device-token/create
export const createDeviceToken = async (req: Request, res: Response) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const { deviceKeyId } = req.body as { deviceKeyId?: string };
    if (!deviceKeyId || typeof deviceKeyId !== "string" || !deviceKeyId.trim()) {
      return res.status(400).json({ error: "MISSING_DEVICE_KEY_ID" });
    }

    const normalizedDeviceKeyId = deviceKeyId.trim();
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashDeviceToken(rawToken);

    await prisma.$transaction(async (tx) => {
      await tx.authDeviceToken.updateMany({
        where: {
          userId: user.id,
          deviceKeyId: normalizedDeviceKeyId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await tx.authDeviceToken.create({
        data: {
          userId: user.id,
          tokenHash,
          deviceKeyId: normalizedDeviceKeyId,
        },
      });
    });

    return res.status(201).json({
      token: rawToken,
      deviceKeyId: normalizedDeviceKeyId,
    });
  } catch (err) {
    console.error("createDeviceToken error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// POST /auth/device-token/login
export const loginWithDeviceToken = async (req: Request, res: Response) => {
  try {
    const { token } = req.body as { token?: string };
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "MISSING_TOKEN" });
    }

    const tokenHash = hashDeviceToken(token);
    const authToken = await prisma.authDeviceToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            sessionVersion: true,
          },
        },
      },
    });

    if (!authToken) {
      return res.status(401).json({ error: "INVALID_DEVICE_TOKEN" });
    }

    await prisma.authDeviceToken.update({
      where: { id: authToken.id },
      data: { lastUsedAt: new Date() },
    });

    return res.json({
      token: signToken(authToken.user.id, authToken.user.sessionVersion),
    });
  } catch (err) {
    console.error("loginWithDeviceToken error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// GET /auth/device-token/current/status
export const getCurrentDeviceTokenStatus = async (req: Request, res: Response) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const deviceKeyId = getDeviceKeyId(req);
    if (!deviceKeyId) {
      return res.status(400).json({ error: "MISSING_DEVICE_KEY_ID" });
    }

    const active = await prisma.authDeviceToken.findFirst({
      where: {
        userId: user.id,
        deviceKeyId,
        revokedAt: null,
      },
      select: { id: true },
    });

    return res.json({
      hasActiveToken: !!active,
    });
  } catch (err) {
    console.error("getCurrentDeviceTokenStatus error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};

// DELETE /auth/device-token/current
export const revokeCurrentDeviceToken = async (req: Request, res: Response) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return res.status(401).json({ error: "UNAUTHENTICATED" });
    }

    const deviceKeyId = getDeviceKeyId(req);
    if (!deviceKeyId) {
      return res.status(400).json({ error: "MISSING_DEVICE_KEY_ID" });
    }

    await prisma.authDeviceToken.updateMany({
      where: {
        userId: user.id,
        deviceKeyId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return res.status(204).send();
  } catch (err) {
    console.error("revokeCurrentDeviceToken error:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
};
