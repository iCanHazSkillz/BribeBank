-- AlterTable
ALTER TABLE "BountyAssignment" ADD COLUMN     "deadlineWarningNotified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "BountyAssignment_status_deadlineExpiresAt_idx" ON "BountyAssignment"("status", "deadlineExpiresAt");
