-- Уже назначенных вручную ответственных не трогаем: такие задачи считаем «изменёнными вручную»
UPDATE "Task" SET "employeesManual" = true
WHERE EXISTS (SELECT 1 FROM "_EmployeeToTask" et WHERE et."B" = "Task".id);
