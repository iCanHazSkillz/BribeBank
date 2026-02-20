ALTER TABLE "User"
ADD COLUMN "quickLoginPromptSeenAt" TIMESTAMP(3);

CREATE TABLE "PasskeyCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "aaguid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "AuthChallengeType" AS ENUM ('PASSKEY_REGISTER', 'PASSKEY_AUTH');

CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "AuthChallengeType" NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthDeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceKeyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthDeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasskeyCredential_credentialId_key" ON "PasskeyCredential"("credentialId");
CREATE INDEX "PasskeyCredential_userId_idx" ON "PasskeyCredential"("userId");
CREATE INDEX "AuthChallenge_type_expiresAt_usedAt_idx" ON "AuthChallenge"("type", "expiresAt", "usedAt");
CREATE UNIQUE INDEX "AuthDeviceToken_tokenHash_key" ON "AuthDeviceToken"("tokenHash");
CREATE INDEX "AuthDeviceToken_userId_revokedAt_idx" ON "AuthDeviceToken"("userId", "revokedAt");
CREATE INDEX "AuthDeviceToken_deviceKeyId_revokedAt_idx" ON "AuthDeviceToken"("deviceKeyId", "revokedAt");

ALTER TABLE "PasskeyCredential" ADD CONSTRAINT "PasskeyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthDeviceToken" ADD CONSTRAINT "AuthDeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
