-- Доходы: наценка цели над расходами, вариант автоподбора и история плана для «Вернуть»
ALTER TABLE "Forum" ADD COLUMN "incomeMargin" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Forum" ADD COLUMN "incomeVariant" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Forum" ADD COLUMN "incomePlanHistory" JSONB NOT NULL DEFAULT '[]';
