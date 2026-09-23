'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { runRemindersNow, saveReminderSettings } from '@/server/actions/settings';

interface S {
  enabled: boolean;
  daysBefore: number;
  managerEmails: string;
  weeklySummary: boolean;
  maxEmailsPerRun: number;
}

export function SettingsForm({
  settings,
  smtp,
  smtpUser,
}: {
  settings: S;
  smtp: boolean;
  smtpUser: string | null;
}) {
  const router = useRouter();
  const [f, setF] = React.useState({
    ...settings,
    daysBefore: String(settings.daysBefore),
    maxEmailsPerRun: String(settings.maxEmailsPerRun),
  });
  const [pending, setPending] = React.useState(false);
  const [running, setRunning] = React.useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const res = await saveReminderSettings({
      enabled: f.enabled,
      daysBefore: Number(f.daysBefore),
      managerEmails: f.managerEmails,
      weeklySummary: f.weeklySummary,
      maxEmailsPerRun: Number(f.maxEmailsPerRun),
    });
    setPending(false);
    if (res.ok) {
      toast.success('Настройки сохранены');
      router.refresh();
    } else toast.error(res.error);
  };

  return (
    <>
      <Card className={`mt-4 p-4 text-sm ${smtp ? '' : 'border-yellow-300 bg-yellow-50'}`}>
        {smtp ? (
          <p>
            Почта настроена: письма отправляются с адреса <b>{smtpUser}</b>. Рассылка запускается
            автоматически каждый день около 09:00 по Москве.
          </p>
        ) : (
          <p>
            Почта (SMTP) не настроена — напоминания видны только на сайте (колокольчик в шапке).
            Чтобы включить письма, задайте в Vercel переменные <code>SMTP_HOST</code>,{' '}
            <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASSWORD</code> (см. README).
          </p>
        )}
      </Card>
      <form onSubmit={save} className="mt-4 space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-brand"
            checked={f.enabled}
            onChange={(e) => setF({ ...f, enabled: e.target.checked })}
          />
          Отправлять напоминания ответственным по e-mail
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="За сколько дней до срока напоминать" hint="По умолчанию — 3 дня">
            <Input
              type="number"
              min={0}
              max={60}
              value={f.daysBefore}
              onChange={(e) => setF({ ...f, daysBefore: e.target.value })}
            />
          </Field>
          <Field
            label="Не больше писем за один запуск"
            hint="Бесплатная почта ограничивает число писем в сутки"
          >
            <Input
              type="number"
              min={1}
              max={500}
              value={f.maxEmailsPerRun}
              onChange={(e) => setF({ ...f, maxEmailsPerRun: e.target.value })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-brand"
            checked={f.weeklySummary}
            onChange={(e) => setF({ ...f, weeklySummary: e.target.checked })}
          />
          Еженедельная сводка по понедельникам
        </label>
        <Field label="Получатели сводки (e-mail руководителя, через запятую)">
          <Input
            value={f.managerEmails}
            onChange={(e) => setF({ ...f, managerEmails: e.target.value })}
            placeholder="boss@example.com"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            Сохранить
          </Button>
          <Button
            variant="outline"
            disabled={running}
            onClick={async () => {
              setRunning(true);
              const res = await runRemindersNow();
              setRunning(false);
              if (res.ok) {
                toast.success(`Напоминаний: ${res.data.reminders}. ${res.data.message}`);
                router.refresh();
              } else toast.error(res.error);
            }}
          >
            <Send /> {running ? 'Отправляем…' : 'Запустить рассылку сейчас'}
          </Button>
        </div>
      </form>
    </>
  );
}
