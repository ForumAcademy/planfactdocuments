-- Предельно допустимые расходы форума, руб. (NULL — лимит не задан)
ALTER TABLE "Forum" ADD COLUMN "expenseLimit" INTEGER;

-- Снабтех: лимит 7 500 000 ₽
UPDATE "Forum"
SET "expenseLimit" = 7500000
WHERE "name" LIKE '%Снабтех%' OR "name" LIKE '%СНАБТЕХ%' OR "name" LIKE '%снабтех%';
