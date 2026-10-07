-- Автоматические диаграммы «Отчёта» и «Отчёта для АЭ» из вкладок «Расходы» и «Доходы»
ALTER TABLE "ReportChart" ADD COLUMN "report" TEXT NOT NULL DEFAULT 'main';
ALTER TABLE "ReportChart" ADD COLUMN "source" TEXT;
CREATE INDEX "ReportChart_forumId_report_idx" ON "ReportChart"("forumId", "report");

-- Пустые заготовки «Расходы» и «Доходы» заменяются автоматическими диаграммами
DELETE FROM "ReportChart" c
WHERE c."source" IS NULL
  AND c."title" IN ('Расходы', 'Доходы')
  AND NOT EXISTS (SELECT 1 FROM "ReportItem" i WHERE i."chartId" = c.id AND i.amount <> 0);

-- Три базовые диаграммы «Отчёта» — перед уже внесёнными вручную
INSERT INTO "ReportChart" ("forumId", "title", "palette", "unit", "order", "sort", "report", "source")
SELECT f.id, v.title, v.palette::"ChartPalette", 'млн руб.', v.ord, 'desc', 'main', v.source
FROM "Forum" f
CROSS JOIN (VALUES
  ('Фактические расходы по статьям', 'RED', -2, 'expenses-fact'),
  ('Фактические доходы по статьям', 'GREEN', -1, 'income-fact'),
  ('Расходы и доходы (факт)', 'BLUE', 0, 'balance')
) AS v(title, palette, ord, source);

-- «Отчёт для АЭ»: прежняя диаграмма факта расходов, с её сортировкой
INSERT INTO "ReportChart" ("forumId", "title", "palette", "unit", "order", "sort", "report", "source")
SELECT f.id, 'Фактические расходы по статьям', 'RED', 'млн руб.', 1, f."aeReportSort", 'ae', 'expenses-fact'
FROM "Forum" f;
