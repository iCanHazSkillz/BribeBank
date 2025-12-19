-- CreateEnum
CREATE TYPE "DenialReason" AS ENUM ('NOT_COMPLETED_ADEQUATELY', 'TOO_OLD_NO_LONGER_REQUIRED', 'NOT_COMPLETED');

-- AlterEnum
ALTER TYPE "BountyStatus" ADD VALUE 'DENIED';

-- AlterTable
ALTER TABLE "BountyAssignment" ADD COLUMN     "denialReason" "DenialReason",
ADD COLUMN     "deniedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "HistoryEvent" ADD COLUMN     "metadata" TEXT;
