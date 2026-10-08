-- Курс доллара по датам (раздел «База данных» → «Курс $»): по курсу на сегодня считаются столбцы «$»
CREATE TABLE "UsdRate" (
    "date" DATE NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsdRate_pkey" PRIMARY KEY ("date")
);

-- Курс, уже введённый у форума, переносится в таблицу на сегодняшнюю дату
INSERT INTO "UsdRate" ("date", "rate")
SELECT (now() AT TIME ZONE 'Europe/Moscow')::date, "usdRate"
FROM "Forum"
WHERE "usdRate" IS NOT NULL
ORDER BY "updatedAt" DESC
LIMIT 1;
