-- Фактические расходы по задаче на сегодня, руб. (вкладка «Расходы» → «Факт»)
ALTER TABLE "Task" ADD COLUMN "costFact" INTEGER NOT NULL DEFAULT 0;
