-- Курс доллара у форума, руб. за 1 $: по нему считаются столбцы «$» и диаграммы в $
ALTER TABLE "Forum" ADD COLUMN "usdRate" DOUBLE PRECISION;
