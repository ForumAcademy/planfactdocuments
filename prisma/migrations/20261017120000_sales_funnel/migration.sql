-- CreateTable
CREATE TABLE "Deal" (
    "id" SERIAL NOT NULL,
    "forumId" INTEGER NOT NULL,
    "company" TEXT NOT NULL,
    "source" TEXT,
    "manager" TEXT,
    "enteredAt" DATE,
    "incomeKey" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'qualification',
    "lostStage" TEXT,
    "stageChangedAt" DATE,
    "decisionDate" DATE,
    "paidDate" DATE,
    "comment" TEXT,
    "incomeStatus" TEXT,
    "incomeItemKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deal_forumId_idx" ON "Deal"("forumId");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "Forum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

