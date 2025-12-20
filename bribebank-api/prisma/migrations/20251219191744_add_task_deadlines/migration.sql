-- AlterEnum
ALTER TYPE "DenialReason" ADD VALUE 'COMPLETED_AFTER_DEADLINE';

-- AlterTable
ALTER TABLE "Bounty" ADD COLUMN     "deadlineHours" INTEGER;

-- AlterTable
ALTER TABLE "BountyAssignment" ADD COLUMN     "deadlineExpiresAt" TIMESTAMP(3),
ADD COLUMN     "deadlineStartedAt" TIMESTAMP(3);
