import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { SettingsForm } from '@/components/settings/settings-form';
import { prisma } from '@/lib/db';
import { getSettings, smtpConfigured } from '@/server/reminders';

export const metadata: Metadata = { title: 'Настройки напоминаний — Статус форумы' };

export default async function SettingsPage() {
  const [settings, log] = await Promise.all([
    getSettings(),
    prisma.reminderLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);
  // Сворачиваем журнал до писем (одна запись на письмо)
  const seen = new Set<string>();
  const letters = log.filter((l) => {
    const k = `${l.dayKey}|${l.recipient}|${l.subject}|${l.status}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <>
      <Breadcrumbs items={[{ label: 'Форумы', href: '/' }, { label: 'Настройки напоминаний' }]} />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-semibold">Настройки напоминаний</h1>
        <SettingsForm
          settings={{
            enabled: settings.enabled,
            daysBefore: settings.daysBefore,
            managerEmails: settings.managerEmails,
            weeklySummary: settings.weeklySummary,
            maxEmailsPerRun: settings.maxEmailsPerRun,
          }}
          smtp={smtpConfigured()}
          smtpUser={process.env.SMTP_USER ?? null}
        />
        <h2 className="mt-8 text-lg font-semibold">Журнал отправок</h2>
        <div className="thin-scroll mt-2 overflow-x-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-ink/70">
              <tr>
                <th className="px-3 py-2">Когда</th>
                <th className="px-3 py-2">Кому</th>
                <th className="px-3 py-2">Тема</th>
                <th className="px-3 py-2">Результат</th>
              </tr>
            </thead>
            <tbody>
              {letters.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-status-gray">
                    Писем пока не отправлялось
                  </td>
                </tr>
              )}
              {letters.map((l) => (
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
