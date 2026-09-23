-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "telegramChatId" TEXT;

-- AlterTable
ALTER TABLE "ReminderLog" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'email';

-- AlterTable
ALTER TABLE "ReminderSettings" ADD COLUMN     "telegramGroup" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "telegramGroupChatId" TEXT,
ADD COLUMN     "telegramGroupTitle" TEXT,
ADD COLUMN     "telegramPersonal" BOOLEAN NOT NULL DEFAULT true;
