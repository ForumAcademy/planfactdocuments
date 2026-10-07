-- Стадия продаж становится свойством статьи: «Участник» на старте и «Участник» на середине —
-- две статьи со своими ценами. Условия и количество «Середины» и «Финальной стадии» билетов
-- переносятся в новые статьи с той же группой и названием.
ALTER TABLE "IncomeItem" ADD COLUMN "stage" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "IncomeItem" ("forumId", "key", "price", "discount", "planQty", "factQty", "stage", "planManual", "label", "group", "removed", "factOnly")
SELECT i."forumId",
       'c_' || substr(md5(random()::text || i."id"::text || s.k::text), 1, 8),
       CASE s.k WHEN 1 THEN COALESCE(i."priceMid", i."price") ELSE COALESCE(i."priceFinal", i."priceMid", i."price") END,
       CASE s.k WHEN 1 THEN COALESCE(i."discountMid", i."discount") ELSE COALESCE(i."discountFinal", i."discountMid", i."discount") END,
       CASE WHEN i."planManual" THEN (CASE s.k WHEN 1 THEN i."planMid" ELSE i."planFinal" END) ELSE 0 END,
       CASE s.k WHEN 1 THEN i."factMid" ELSE i."factFinal" END,
       s.k,
       i."planManual",
       COALESCE(i."label", CASE i."key" WHEN 'vip' THEN 'VIP' WHEN 'participant' THEN 'Участник' ELSE 'Позиция' END),
       'tickets',
       false,
       i."factOnly"
FROM "IncomeItem" i
CROSS JOIN (VALUES (1), (2)) AS s(k)
WHERE i."removed" = false
  AND (i."group" = 'tickets' OR i."key" IN ('vip', 'participant'))
  AND (
    (s.k = 1 AND ((i."planManual" AND i."planMid" > 0) OR i."factMid" > 0 OR i."priceMid" IS NOT NULL OR i."discountMid" IS NOT NULL))
    OR (s.k = 2 AND ((i."planManual" AND i."planFinal" > 0) OR i."factFinal" > 0 OR i."priceFinal" IS NOT NULL OR i."discountFinal" IS NOT NULL))
  );

-- Своя статья, у которой на «Старте» ничего не было и цены стадий не задавались, целиком
-- переехала в статьи «Середины» / «Финала» — пустую статью «Старта» убираем
DELETE FROM "IncomeItem"
WHERE "key" NOT IN ('general', 'strategic', 'partner', 'vip', 'participant')
  AND "group" = 'tickets'
  AND "planQty" = 0 AND "factQty" = 0
  AND "priceMid" IS NULL AND "priceFinal" IS NULL AND "discountMid" IS NULL AND "discountFinal" IS NULL
  AND (("planManual" AND ("planMid" > 0 OR "planFinal" > 0)) OR "factMid" > 0 OR "factFinal" > 0);

-- Партнёрства без стадий: всё количество — в одной статье
UPDATE "IncomeItem"
SET "planQty" = "planQty" + "planMid" + "planFinal", "factQty" = "factQty" + "factMid" + "factFinal"
WHERE NOT ("group" = 'tickets' OR "key" IN ('vip', 'participant'));

ALTER TABLE "IncomeItem"
  DROP COLUMN "planMid",
  DROP COLUMN "planFinal",
  DROP COLUMN "factMid",
  DROP COLUMN "factFinal",
  DROP COLUMN "priceMid",
  DROP COLUMN "priceFinal",
  DROP COLUMN "discountMid",
  DROP COLUMN "discountFinal";

ALTER TABLE "Forum" DROP COLUMN "shareStart", DROP COLUMN "shareMid", DROP COLUMN "shareFinal";
