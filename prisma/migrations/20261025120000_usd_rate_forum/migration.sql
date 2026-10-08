-- Курс доллара можно привязать к форуму: курсы без форума действуют для всех форумов без своих курсов
ALTER TABLE "UsdRate" DROP CONSTRAINT "UsdRate_pkey";
ALTER TABLE "UsdRate" ADD COLUMN "id" SERIAL NOT NULL;
ALTER TABLE "UsdRate" ADD COLUMN "forumId" INTEGER;
ALTER TABLE "UsdRate" ADD CONSTRAINT "UsdRate_pkey" PRIMARY KEY ("id");
CREATE INDEX "UsdRate_forumId_date_idx" ON "UsdRate"("forumId", "date");
ALTER TABLE "UsdRate" ADD CONSTRAINT "UsdRate_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "Forum"("id") ON DELETE CASCADE ON UPDATE CASCADE;
