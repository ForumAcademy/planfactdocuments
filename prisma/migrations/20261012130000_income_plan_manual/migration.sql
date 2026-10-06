-- План позиции задан вручную; иначе количество подбирается под цель автоматически
ALTER TABLE "IncomeItem" ADD COLUMN "planManual" BOOLEAN NOT NULL DEFAULT false;

-- Свои позиции доходов: название, группа; позиции по умолчанию можно переименовать или убрать
ALTER TABLE "IncomeItem" ADD COLUMN "label" TEXT;
ALTER TABLE "IncomeItem" ADD COLUMN "group" TEXT;
ALTER TABLE "IncomeItem" ADD COLUMN "removed" BOOLEAN NOT NULL DEFAULT false;
