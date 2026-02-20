-- CreateEnum
CREATE TYPE "RecurrenceCadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "RecurrencePattern" AS ENUM ('DAY_OF_WEEK', 'DAY_OF_MONTH');

-- AlterTable
ALTER TABLE "Family" ADD COLUMN "timezone" TEXT;

-- AlterTable
ALTER TABLE "Bounty"
ADD COLUMN "recurrenceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recurrenceCadence" "RecurrenceCadence",
ADD COLUMN "recurrencePattern" "RecurrencePattern",
ADD COLUMN "recurrenceDayOfWeek" INTEGER,
ADD COLUMN "recurrenceDayOfMonth" INTEGER,
ADD COLUMN "recurrenceWeekOfMonth" INTEGER,
ADD COLUMN "recurrenceMonthOfYear" INTEGER,
ADD COLUMN "streakEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BountyAssignment"
ADD COLUMN "recurrenceSeriesId" TEXT,
ADD COLUMN "occurrenceStartAt" TIMESTAMP(3),
ADD COLUMN "streakCountAtClose" INTEGER,
ADD COLUMN "streakGenerationAtClose" INTEGER;

-- CreateTable
CREATE TABLE "BountyStreakMilestone" (
    "id" TEXT NOT NULL,
    "bountyId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BountyStreakMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BountyRecurrenceSeries" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "bountyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pausedAt" TIMESTAMP(3),
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "streakGeneration" INTEGER NOT NULL DEFAULT 0,
    "nextOccurrenceAt" TIMESTAMP(3) NOT NULL,
    "currentAssignmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BountyRecurrenceSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BountyStreakAward" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "bountyAssignmentId" TEXT NOT NULL,
    "streakGeneration" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardValue" TEXT NOT NULL,
    "rewardAssignmentId" TEXT,
    "ticketsAwarded" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BountyStreakAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BountyStreakMilestone_bountyId_threshold_key" ON "BountyStreakMilestone"("bountyId", "threshold");

-- CreateIndex
CREATE INDEX "BountyStreakMilestone_bountyId_idx" ON "BountyStreakMilestone"("bountyId");

-- CreateIndex
CREATE UNIQUE INDEX "BountyRecurrenceSeries_bountyId_userId_key" ON "BountyRecurrenceSeries"("bountyId", "userId");

-- CreateIndex
CREATE INDEX "BountyRecurrenceSeries_familyId_active_pausedAt_nextOccurrenceAt_idx" ON "BountyRecurrenceSeries"("familyId", "active", "pausedAt", "nextOccurrenceAt");

-- CreateIndex
CREATE UNIQUE INDEX "BountyStreakAward_seriesId_milestoneId_streakGeneration_key" ON "BountyStreakAward"("seriesId", "milestoneId", "streakGeneration");

-- CreateIndex
CREATE INDEX "BountyStreakAward_bountyAssignmentId_idx" ON "BountyStreakAward"("bountyAssignmentId");

-- CreateIndex
CREATE INDEX "BountyStreakAward_rewardAssignmentId_idx" ON "BountyStreakAward"("rewardAssignmentId");

-- CreateIndex
CREATE INDEX "BountyAssignment_recurrenceSeriesId_idx" ON "BountyAssignment"("recurrenceSeriesId");

-- CreateIndex
CREATE UNIQUE INDEX "BountyAssignment_recurrenceSeriesId_occurrenceStartAt_key" ON "BountyAssignment"("recurrenceSeriesId", "occurrenceStartAt");

-- AddForeignKey
ALTER TABLE "BountyStreakMilestone" ADD CONSTRAINT "BountyStreakMilestone_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "Bounty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BountyRecurrenceSeries" ADD CONSTRAINT "BountyRecurrenceSeries_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BountyRecurrenceSeries" ADD CONSTRAINT "BountyRecurrenceSeries_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "Bounty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BountyRecurrenceSeries" ADD CONSTRAINT "BountyRecurrenceSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BountyRecurrenceSeries" ADD CONSTRAINT "BountyRecurrenceSeries_currentAssignmentId_fkey" FOREIGN KEY ("currentAssignmentId") REFERENCES "BountyAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BountyAssignment" ADD CONSTRAINT "BountyAssignment_recurrenceSeriesId_fkey" FOREIGN KEY ("recurrenceSeriesId") REFERENCES "BountyRecurrenceSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BountyStreakAward" ADD CONSTRAINT "BountyStreakAward_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "BountyRecurrenceSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BountyStreakAward" ADD CONSTRAINT "BountyStreakAward_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "BountyStreakMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BountyStreakAward" ADD CONSTRAINT "BountyStreakAward_bountyAssignmentId_fkey" FOREIGN KEY ("bountyAssignmentId") REFERENCES "BountyAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BountyStreakAward" ADD CONSTRAINT "BountyStreakAward_rewardAssignmentId_fkey" FOREIGN KEY ("rewardAssignmentId") REFERENCES "AssignedPrize"("id") ON DELETE SET NULL ON UPDATE CASCADE;
