-- Новые цветовые гаммы диаграмм
ALTER TYPE "ChartPalette" ADD VALUE IF NOT EXISTS 'PURPLE';
ALTER TYPE "ChartPalette" ADD VALUE IF NOT EXISTS 'CYAN';
ALTER TYPE "ChartPalette" ADD VALUE IF NOT EXISTS 'ORANGE';

-- Автоматические диаграммы обновляются кнопкой «Автообновление»; подраздел «Архив»
ALTER TABLE "ReportChart" ADD COLUMN "refreshedAt" TIMESTAMP(3);
ALTER TABLE "ReportChart" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
