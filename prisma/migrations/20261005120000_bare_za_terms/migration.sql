-- «за 1 месяц», «за 2 недели», «за месяц» без «до …» теперь означают «до форума».
-- Пересчитываем задачи с такими сроками, которые были помечены «примерный срок»
-- (даты, поставленные вручную, не трогаем). Окончание = начало форума минус срок,
-- начало = окончание минус 7 дней (минус 1 день, если в сроке есть уточнение).
WITH m AS (
  SELECT t.id,
         f."startDate" AS fs,
         regexp_match(
           lower(btrim(regexp_replace(t."termText", '\s+', ' ', 'g'))),
           '^за (\d+ )?(дн[а-я]*|день|недел[а-я]*|месяц[а-я]*|мес\.?)\s*([,;(].*)?$'
         ) AS g
  FROM "Task" t
  JOIN "Forum" f ON f.id = t."forumId"
  WHERE t."needsClarification" = true AND t."datesManual" = false
),
e AS (
  SELECT id,
         (fs - (coalesce(nullif(btrim(g[1]), ''), '1') ||
                CASE WHEN g[2] LIKE 'нед%' THEN ' weeks'
                     WHEN g[2] LIKE 'мес%' THEN ' months'
                     ELSE ' days' END)::interval)::date AS d,
         g[3] IS NOT NULL AS q
  FROM m
  WHERE g IS NOT NULL
)
UPDATE "Task" t
SET "endDate" = e.d,
    "startDate" = e.d - (CASE WHEN e.q THEN 1 ELSE 7 END),
    "needsClarification" = false
FROM e
WHERE t.id = e.id;
