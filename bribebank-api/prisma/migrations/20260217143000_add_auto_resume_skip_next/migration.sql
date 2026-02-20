ALTER TABLE "BountyRecurrenceSeries"
ADD COLUMN "autoResumeSkipAt" TIMESTAMP(3);

CREATE INDEX "BountyRecurrenceSeries_active_pausedAt_autoResumeSkipAt_idx"
ON "BountyRecurrenceSeries"("active", "pausedAt", "autoResumeSkipAt");
