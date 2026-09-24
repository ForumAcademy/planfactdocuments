-- «На протяжении этапа» — срок понятен (весь этап), пометка «примерный срок» не нужна.
-- Даты у таких задач уже равны границам этапа, меняется только пометка.
UPDATE "Task"
SET "needsClarification" = false
WHERE "needsClarification" = true
  AND "datesManual" = false
  AND lower("termText") ~ '(протяжении (всего )?этапа|в течение (всего )?этапа|весь этап)';
