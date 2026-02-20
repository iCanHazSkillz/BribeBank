import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthChallengeType } from "@prisma/client";

const {
  prismaMock,
  generateRegistrationOptionsMock,
  verifyRegistrationResponseMock,
  generateAuthenticationOptionsMock,
  verifyAuthenticationResponseMock,
} = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    passkeyCredential: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    authDeviceToken: {
      count: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    authChallenge: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  generateRegistrationOptionsMock: vi.fn(),
  verifyRegistrationResponseMock: vi.fn(),
  generateAuthenticationOptionsMock: vi.fn(),
  verifyAuthenticationResponseMock: vi.fn(),
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn(() => "signed-token"),
  },
}));

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: generateRegistrationOptionsMock,
  verifyRegistrationResponse: verifyRegistrationResponseMock,
  generateAuthenticationOptions: generateAuthenticationOptionsMock,
  verifyAuthenticationResponse: verifyAuthenticationResponseMock,
}));

import {
  createDeviceToken,
  getCurrentDeviceTokenStatus,
  getPasskeyAuthOptions,
  getPasskeyRegisterOptions,
  getQuickLoginStatus,
  loginWithDeviceToken,
  markQuickLoginPromptSeen,
  revokeCurrentDeviceToken,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
} from "../src/controllers/quickLoginController.js";

function req(params: Record<string, string> = {}, body: any = {}, userId?: string, headers: Record<string, string> = {}) {
  return {
    params,
    body,
    userId,
    headers,
  } as any;
}

function res() {
  const out: any = {};
  out.status = vi.fn().mockReturnValue(out);
  out.json = vi.fn().mockReturnValue(out);
  out.send = vi.fn().mockReturnValue(out);
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  prismaMock.user.findUnique.mockResolvedValue({
    id: "user-1",
    sessionVersion: 3,
    username: "kid",
    displayName: "Kid",
    quickLoginPromptSeenAt: null,
  });
});

describe("quickLoginController", () => {
  it("returns quick-login status with derived prompt field", async () => {
    prismaMock.passkeyCredential.count.mockResolvedValue(0);
    prismaMock.authDeviceToken.count.mockResolvedValue(0);
    const response = res();

    await getQuickLoginStatus(req({}, {}, "user-1"), response);

    expect(response.json).toHaveBeenCalledWith({
      hasPasskey: false,
      hasDeviceTokenMethod: false,
      setupPromptSeen: false,
      needsInitialSetupPrompt: true,
    });
  });

  it("marks quick-login prompt as seen", async () => {
    const response = res();
    await markQuickLoginPromptSeen(req({}, {}, "user-1"), response);
    expect(prismaMock.user.update).toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(204);
  });

  it("creates a device token for current device", async () => {
    const response = res();
    await createDeviceToken(req({}, { deviceKeyId: "dev-1" }, "user-1"), response);
    expect(prismaMock.authDeviceToken.updateMany).toHaveBeenCalled();
    expect(prismaMock.authDeviceToken.create).toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceKeyId: "dev-1",
        token: expect.any(String),
      })
    );
  });

  it("logs in with valid device token", async () => {
    prismaMock.authDeviceToken.findFirst.mockResolvedValue({
      id: "dt-1",
      user: { id: "user-1", sessionVersion: 3 },
    });
    const response = res();
    await loginWithDeviceToken(req({}, { token: "raw-token" }), response);
    expect(prismaMock.authDeviceToken.update).toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({ token: "signed-token" });
  });

  it("reports current-device token status", async () => {
    prismaMock.authDeviceToken.findFirst.mockResolvedValue({ id: "dt-1" });
    const response = res();
    await getCurrentDeviceTokenStatus(
      req({}, {}, "user-1", { "x-device-key-id": "dev-1" }),
      response
    );
    expect(response.json).toHaveBeenCalledWith({ hasActiveToken: true });
  });

  it("revokes current-device tokens", async () => {
    const response = res();
    await revokeCurrentDeviceToken(
      req({}, {}, "user-1", { "x-device-key-id": "dev-1" }),
      response
    );
    expect(prismaMock.authDeviceToken.updateMany).toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(204);
  });

  it("returns passkey register options with persisted challenge", async () => {
    prismaMock.passkeyCredential.findMany.mockResolvedValue([]);
    generateRegistrationOptionsMock.mockResolvedValue({
      challenge: "challenge-1",
    });
    prismaMock.authChallenge.create.mockResolvedValue({ id: "challenge-id-1" });

    const response = res();
    await getPasskeyRegisterOptions(req({}, {}, "user-1"), response);

    expect(generateRegistrationOptionsMock).toHaveBeenCalled();
    expect(prismaMock.authChallenge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AuthChallengeType.PASSKEY_REGISTER,
          challenge: "challenge-1",
        }),
      })
    );
    expect(response.json).toHaveBeenCalledWith({
      challengeId: "challenge-id-1",
      options: { challenge: "challenge-1" },
    });
  });

  it("verifies passkey registration and stores credential", async () => {
    prismaMock.authChallenge.findUnique.mockResolvedValue({
      id: "challenge-id",
      userId: "user-1",
      type: AuthChallengeType.PASSKEY_REGISTER,
      challenge: "expected",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    verifyRegistrationResponseMock.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialID: "cred-id-1",
        credentialPublicKey: Buffer.from("pub-key"),
        counter: 3,
        aaguid: "aaguid-1",
      },
    });
    prismaMock.passkeyCredential.findUnique.mockResolvedValue(null);

    const response = res();
    await verifyPasskeyRegistration(
      req({}, { challengeId: "challenge-id", response: { response: { transports: ["internal"] } } }, "user-1"),
      response
    );

    expect(prismaMock.passkeyCredential.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          credentialId: "cred-id-1",
          counter: 3,
          aaguid: "aaguid-1",
        }),
      })
    );
    expect(prismaMock.authChallenge.update).toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it("rejects replayed passkey registration challenge", async () => {
    prismaMock.authChallenge.findUnique.mockResolvedValue({
      id: "challenge-id",
      userId: "user-1",
      type: AuthChallengeType.PASSKEY_REGISTER,
      challenge: "expected",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = res();
    await verifyPasskeyRegistration(
      req({}, { challengeId: "challenge-id", response: {} }, "user-1"),
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: "INVALID_CHALLENGE" });
    expect(prismaMock.passkeyCredential.create).not.toHaveBeenCalled();
  });

  it("returns passkey auth options with persisted challenge", async () => {
    generateAuthenticationOptionsMock.mockResolvedValue({
      challenge: "auth-challenge-1",
    });
    prismaMock.authChallenge.create.mockResolvedValue({ id: "auth-challenge-id-1" });

    const response = res();
    await getPasskeyAuthOptions(req(), response);

    expect(prismaMock.authChallenge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AuthChallengeType.PASSKEY_AUTH,
          challenge: "auth-challenge-1",
        }),
      })
    );
    expect(response.json).toHaveBeenCalledWith({
      challengeId: "auth-challenge-id-1",
      options: { challenge: "auth-challenge-1" },
    });
  });

  it("verifies passkey authentication and updates counter", async () => {
    prismaMock.authChallenge.findUnique.mockResolvedValue({
      id: "challenge-id",
      type: AuthChallengeType.PASSKEY_AUTH,
      challenge: "expected",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.passkeyCredential.findUnique.mockResolvedValue({
      id: "pk-1",
      credentialId: "cred-1",
      publicKey: Buffer.from("abc").toString("base64"),
      counter: 5,
      transports: JSON.stringify(["internal"]),
      user: { id: "user-1", sessionVersion: 3 },
    });
    verifyAuthenticationResponseMock.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 6 },
    });

    const response = res();
    await verifyPasskeyAuthentication(
      req({}, { challengeId: "challenge-id", response: { id: "cred-1" } }),
      response
    );

    expect(prismaMock.passkeyCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pk-1" },
        data: expect.objectContaining({ counter: 6 }),
      })
    );
    expect(response.json).toHaveBeenCalledWith({ token: "signed-token" });
  });
});
