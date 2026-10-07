-- Доходы: три этапа цен («Старт продаж», «Середина», «Финальная стадия») и скидки.
-- Прежнее фактическое количество считается проданным по ценам «Старта»; цены «Середины» и
-- «Финала» не заданы — равны цене «Старта», поэтому суммы по существующим форумам не меняются.
ALTER TABLE "IncomeItem" ADD COLUMN "priceMid" INTEGER;
ALTER TABLE "IncomeItem" ADD COLUMN "priceFinal" INTEGER;
ALTER TABLE "IncomeItem" ADD COLUMN "factMid" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IncomeItem" ADD COLUMN "factFinal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IncomeItem" ADD COLUMN "discountPersonal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IncomeItem" ADD COLUMN "discountPartner" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Forum" ADD COLUMN "priceMidDate" DATE;
ALTER TABLE "Forum" ADD COLUMN "priceFinalDate" DATE;
ALTER TABLE "Forum" ADD COLUMN "shareStart" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Forum" ADD COLUMN "shareMid" INTEGER NOT NULL DEFAULT 40;
ALTER TABLE "Forum" ADD COLUMN "shareFinal" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Forum" ADD COLUMN "discountPersonalPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Forum" ADD COLUMN "discountPartnerPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
