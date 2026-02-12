-- Add family-level password recovery key storage
ALTER TABLE "Family"
ADD COLUMN "passwordRecoveryKeyHash" TEXT,
ADD COLUMN "passwordRecoveryKeyUpdatedAt" TIMESTAMP(3);
