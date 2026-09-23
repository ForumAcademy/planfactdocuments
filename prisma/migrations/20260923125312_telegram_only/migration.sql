-- Напоминания только через Telegram: убираем почту
ALTER TABLE "Employee" DROP COLUMN "email",
DROP COLUMN "phone";

ALTER TABLE "ReminderSettings" DROP COLUMN "enabled",
DROP COLUMN "managerEmails",
DROP COLUMN "maxEmailsPerRun";

ALTER TABLE "ReminderLog" ALTER COLUMN "channel" SET DEFAULT 'telegram';
