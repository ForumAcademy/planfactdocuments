-- CreateTable
CREATE TABLE "IncomeItem" (
    "id" SERIAL NOT NULL,
    "forumId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "planQty" INTEGER NOT NULL DEFAULT 0,
    "factQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IncomeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncomeItem_forumId_key_key" ON "IncomeItem"("forumId", "key");

-- AddForeignKey
ALTER TABLE "IncomeItem" ADD CONSTRAINT "IncomeItem_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "Forum"("id") ON DELETE CASCADE ON UPDATE CASCADE;
