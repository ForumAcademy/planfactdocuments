-- Сортировка статей в диаграммах отчёта и «Отчёта для АЭ»
ALTER TABLE "ReportChart" ADD COLUMN "sort" TEXT NOT NULL DEFAULT 'desc';
ALTER TABLE "Forum" ADD COLUMN "aeReportSort" TEXT NOT NULL DEFAULT 'desc';
