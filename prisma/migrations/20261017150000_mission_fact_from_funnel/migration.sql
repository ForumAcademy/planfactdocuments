-- Факт доходов «Бизнес-миссии СнабТех`26» — заново из воронки (по просьбе пользователя, 2026-10-07).
-- Проданное, внесённое вручную до того, как оплаченные сделки стали сами входить в факт, складывалось
-- со сделками воронки: 47 шт. вместо 32. Ручной факт всех статей обнуляется, статьи «только для факта»
-- удаляются, у оплаченных сделок снимаются отметки «внесена» / «исключена» — в факте остаются только
-- сделки воронки, каждая в стадии по дате оплаты. План не меняется.
-- Форум ищется по «Миссия» и «СнабТех»; если таких не ровно один — ничего не меняется.
DO $$
DECLARE
  mid INTEGER;
  cnt INTEGER;
BEGIN
  SELECT count(*), min("id") INTO cnt, mid
  FROM "Forum"
  WHERE NOT "archived"
    AND "name" ~ '[Мм][Ии][Сс][Сс][Ии][Яя]'
    AND "name" ~ '[Сс][Нн][Аа][Бб][ -]?[Тт][Ее][Хх]';

  IF cnt <> 1 THEN
    RAISE NOTICE 'Бизнес-миссия СнабТех: найдено форумов % — факт не очищен', cnt;
    RETURN;
  END IF;

  DELETE FROM "IncomeItem" WHERE "forumId" = mid AND "factOnly";
  UPDATE "IncomeItem" SET "factQty" = 0 WHERE "forumId" = mid AND "factQty" <> 0;
  UPDATE "Deal" SET "incomeStatus" = NULL, "incomeItemKey" = NULL, "updatedAt" = now()
  WHERE "forumId" = mid AND "incomeStatus" IS NOT NULL;
END $$;
