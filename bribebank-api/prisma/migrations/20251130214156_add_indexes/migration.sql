-- CreateIndex
CREATE INDEX "AssignedPrize_familyId_userId_status_idx" ON "AssignedPrize"("familyId", "userId", "status");

-- CreateIndex
CREATE INDEX "AssignedPrize_userId_status_idx" ON "AssignedPrize"("userId", "status");

-- CreateIndex
CREATE INDEX "AssignedPrize_familyId_assignedAt_idx" ON "AssignedPrize"("familyId", "assignedAt");

-- CreateIndex
CREATE INDEX "Bounty_familyId_createdAt_idx" ON "Bounty"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "BountyAssignment_familyId_userId_idx" ON "BountyAssignment"("familyId", "userId");

-- CreateIndex
CREATE INDEX "BountyAssignment_familyId_status_idx" ON "BountyAssignment"("familyId", "status");

-- CreateIndex
CREATE INDEX "Claim_userId_createdAt_idx" ON "Claim"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "HistoryEvent_familyId_userId_createdAt_idx" ON "HistoryEvent"("familyId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Reward_familyId_createdAt_idx" ON "Reward"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "User_familyId_createdAt_idx" ON "User"("familyId", "createdAt");
