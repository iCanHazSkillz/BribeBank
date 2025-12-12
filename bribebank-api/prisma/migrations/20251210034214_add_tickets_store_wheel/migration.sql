-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ticketBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StoreItem" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "productUrl" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WheelSegment" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "prob" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WheelSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreItem_familyId_createdAt_idx" ON "StoreItem"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "WheelSegment_familyId_idx" ON "WheelSegment"("familyId");

-- AddForeignKey
ALTER TABLE "StoreItem" ADD CONSTRAINT "StoreItem_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelSegment" ADD CONSTRAINT "WheelSegment_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
