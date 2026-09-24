-- Справочник формулировок срока
CREATE TABLE "TermPhrase" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TermPhrase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TermPhrase_text_key" ON "TermPhrase"("text");

-- Начальное наполнение: все формулировки из мастер-плана и задач форумов
INSERT INTO "TermPhrase" ("text", "order")
SELECT t, (ROW_NUMBER() OVER (ORDER BY cnt DESC, t))::int
FROM (
  SELECT btrim(regexp_replace("termText", '\s+', ' ', 'g')) AS t, count(*) AS cnt
  FROM (
    SELECT "termText" FROM "TemplateTask"
    UNION ALL
    SELECT "termText" FROM "Task"
  ) src
  WHERE btrim("termText") <> ''
  GROUP BY 1
) x
ON CONFLICT ("text") DO NOTHING;
