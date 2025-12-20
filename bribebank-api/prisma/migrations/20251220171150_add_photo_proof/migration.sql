-- AlterTable
ALTER TABLE "Bounty" ADD COLUMN     "requiresPhoto" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BountyAssignment" ADD COLUMN     "photoUrl" TEXT;
