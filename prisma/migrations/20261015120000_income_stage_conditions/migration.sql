-- Доходы: условия продаж по этапам. У билета на каждом этапе своя цена, индивидуальная
-- скидка (%) и план (шт.); итог складывается из всех этапов. У партнёрств этапов нет.
-- Общие плановые скидки форума и суммы скидок в факте заменены скидкой позиции в процентах.
ALTER TABLE "IncomeItem" ADD COLUMN "planMid" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IncomeItem" ADD COLUMN "planFinal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "IncomeItem" ADD COLUMN "discount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "IncomeItem" ADD COLUMN "discountMid" DOUBLE PRECISION;
ALTER TABLE "IncomeItem" ADD COLUMN "discountFinal" DOUBLE PRECISION;

-- Прежний план билета — общее количество: раскладываем его по этапам 30 / 40 / 30.
-- У партнёрств этапов нет, их план остаётся целиком.
UPDATE "IncomeItem"
SET "planFinal" = floor("planQty" * 0.3),
    "planMid" = "planQty" - 2 * floor("planQty" * 0.3),
    "planQty" = floor("planQty" * 0.3)
WHERE "planQty" > 0
  AND ("key" IN ('vip', 'participant') OR "group" = 'tickets');

ALTER TABLE "IncomeItem" DROP COLUMN "discountPersonal";
ALTER TABLE "IncomeItem" DROP COLUMN "discountPartner";
ALTER TABLE "Forum" DROP COLUMN "discountPersonalPct";
ALTER TABLE "Forum" DROP COLUMN "discountPartnerPct";
