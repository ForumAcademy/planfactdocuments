import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { SettingsForm } from '@/components/settings/settings-form';
import { appUrl } from '@/lib/telegram-format';
import { prisma } from '@/lib/db';
import { getSettings } from '@/server/reminders';
import { getBotInfo, groupConnectCode, telegramConfigured } from '@/server/telegram';

export const metadata: Metadata = { title: 'Напоминания — Статус форумов' };

export default async function SettingsPage() {
  const configured = telegramConfigured();
  const [settings, log, bot, employees] = await Promise.all([
    getSettings(),
    prisma.reminderLog.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }),
    getBotInfo(),
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, fullName: true, telegram: true, telegramChatId: true },
      orderBy: { fullName: 'asc' },
    }),
  ]);
  // Журнал: одна запись на сообщение
  const seen = new Set<string>();
  const messages = log.filter((l) => {
    const k = `${l.dayKey}|${l.recipient}|${l.subject}|${l.status}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <>
      <Breadcrumbs items={[{ label: 'Форумы', href: '/' }, { label: 'Напоминания' }]} />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-semibold">Напоминания в Telegram</h1>
        <SettingsForm
          settings={{
            daysBefore: settings.daysBefore,
            weeklySummary: settings.weeklySummary,
            telegramPersonal: settings.telegramPersonal,
            telegramGroup: settings.telegramGroup,
          }}
          configured={configured}
          bot={bot}
          group={
            settings.telegramGroupChatId
              ? { title: settings.telegramGroupTitle ?? 'чат команды' }
              : null
          }
          connectCode={configured ? groupConnectCode() : ''}
          site={{
            raw: process.env.APP_URL ?? '',
            fallback: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '',
            url: appUrl() ?? null,
          }}
          employees={employees.map((e) => ({
            id: e.id,
            fullName: e.fullName,
            telegram: e.telegram,
            linked: Boolean(e.telegramChatId),
          }))}
        />
        <h2 className="mt-8 text-lg font-semibold">Журнал отправок</h2>
        <div className="thin-scroll mt-2 overflow-x-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-ink/70">
              <tr>
                <th className="px-3 py-2">Когда</th>
                <th className="px-3 py-2">Кому</th>
                <th className="px-3 py-2">Что</th>
                <th className="px-3 py-2">Результат</th>
              </tr>
            </thead>
            <tbody>
              {messages.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-status-gray">
                    Сообщений пока не отправлялось
                  </td>
                </tr>
              )}
              {messages.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="whitespace-nowrap px-3 py-2">
                    {l.createdAt.toLocaleString('ru-RU', {
                      timeZone: 'Europe/Moscow',
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-3 py-2">{l.recipient}</td>
                  <td className="px-3 py-2">{l.subject}</td>
                  <td className="px-3 py-2">
                    {l.status === 'sent' ? (
                      <span className="text-status-green">отправлено</span>
                    ) : (
                      <span className="text-status-red" title={l.error ?? ''}>
                        ошибка{l.error ? `: ${l.error.slice(0, 80)}` : ''}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
