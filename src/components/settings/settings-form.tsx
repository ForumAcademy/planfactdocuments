'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import { Check, Copy, Link2, Send, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  connectTelegramBot,
  disconnectTelegramGroup,
  runRemindersNow,
  saveReminderSettings,
  testTelegramGroup,
} from '@/server/actions/settings';

interface S {
  daysBefore: number;
  weeklySummary: boolean;
  telegramPersonal: boolean;
  telegramGroup: boolean;
}

interface Emp {
  id: number;
  fullName: string;
  telegram: string | null;
  linked: boolean;
}

function CopyText({ text }: { text: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <code className="rounded bg-surface px-2 py-1 font-mono text-sm">{text}</code>
      <Button
        size="iconSm"
        variant="ghost"
        title="Скопировать"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          } catch {
            toast.error('Не удалось скопировать — выделите текст вручную');
          }
        }}
      >
        {done ? <Check /> : <Copy />}
      </Button>
    </span>
  );
}

export function SettingsForm({
  settings,
  configured,
  bot,
  group,
  connectCode,
  employees,
}: {
  settings: S;
  configured: boolean;
  bot: { username: string; name: string } | null;
  group: { title: string } | null;
  connectCode: string;
  employees: Emp[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [f, setF] = React.useState({ ...settings, daysBefore: String(settings.daysBefore) });
  const [busy, setBusy] = React.useState<string | null>(null);

  const act = async <T,>(
    key: string,
    fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    ok: (d: T) => string,
  ) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      toast.success(ok(res.data));
      router.refresh();
    } else toast.error(res.error);
  };

  const linked = employees.filter((e) => e.linked);
  const waiting = employees.filter((e) => !e.linked && e.telegram);
  const noNick = employees.filter((e) => !e.telegram);
  const botLink = bot ? `https://t.me/${bot.username}` : null;

  if (!configured) {
    return (
      <Card className="mt-4 border-yellow-300 bg-yellow-50 p-4 text-sm">
        Бот не настроен: задайте в Vercel переменную <code>TELEGRAM_BOT_TOKEN</code> (токен от
        @BotFather) и пересоберите сайт. Пока напоминания видны только на сайте — в колокольчике в
        шапке.
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-5">
      {/* 1. Бот */}
      <Card className="p-4">
        <h2 className="font-semibold">1. Бот</h2>
        {bot ? (
          <p className="mt-1 text-sm">
            Бот:{' '}
            <a
              href={botLink!}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand hover:underline"
            >
              @{bot.username}
            </a>{' '}
            ({bot.name}). Нажмите «Подключить бота» один раз после настройки и после смены адреса
            сайта — чтобы бот узнавал команды /start.
          </p>
        ) : (
          <p className="mt-1 text-sm text-status-red">
            Не удалось связаться с Telegram. Проверьте токен в переменной TELEGRAM_BOT_TOKEN.
          </p>
        )}
        <Button
          className="mt-3"
          disabled={busy !== null}
          onClick={() => act('connect', connectTelegramBot, (m) => m)}
          data-testid="tg-connect"
        >
          <Link2 /> {busy === 'connect' ? 'Подключаем…' : 'Подключить бота'}
        </Button>
      </Card>

      {/* 2. Личные напоминания */}
      <Card className="p-4">
        <h2 className="font-semibold">2. Личные напоминания ответственным</h2>
        <p className="mt-1 text-sm text-ink/80">
          Каждое утро (около 09:00 МСК) ответственный получает свои задачи: просроченные, со сроком
          в ближайшие дни и те, которые пора начинать. Чтобы подключиться, сотрудник:
        </p>
        <ol className="mt-1 list-inside list-decimal text-sm text-ink/80">
          <li>указан в «База данных → Ответственные» со своим ником Telegram;</li>
          <li>
            открывает бота{' '}
            {botLink && (
              <a
                href={botLink}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                {botLink}
              </a>
            )}{' '}
            и нажимает «Старт».
          </li>
        </ol>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md bg-green-50 p-3">
            <div className="font-medium text-status-green">Подключены ({linked.length})</div>
            <div className="mt-1 text-ink/80">
              {linked.map((e) => e.fullName).join(', ') || '—'}
            </div>
          </div>
          <div className="rounded-md bg-yellow-50 p-3">
            <div className="font-medium text-yellow-800">
              Ждём «Старт» у бота ({waiting.length})
            </div>
            <div className="mt-1 text-ink/80">
              {waiting.map((e) => `${e.fullName} (${e.telegram})`).join(', ') || '—'}
            </div>
          </div>
          <div className="rounded-md bg-surface p-3">
            <div className="font-medium text-ink/70">Не указан ник ({noNick.length})</div>
            <div className="mt-1 text-ink/80">
              {noNick.map((e) => e.fullName).join(', ') || '—'}
            </div>
          </div>
        </div>
      </Card>

      {/* 3. Общий чат */}
      <Card className="p-4">
        <h2 className="font-semibold">3. Общий чат команды</h2>
        {group ? (
          <>
            <p className="mt-1 text-sm">
              Подключён чат <b>«{group.title}»</b>. Каждое утро туда приходит сводка, по
              понедельникам — еженедельная.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  act('test', testTelegramGroup, () => 'Проверочное сообщение отправлено')
                }
              >
                <Send /> Отправить проверку в чат
              </Button>
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={async () => {
                  if (
                    await confirm({
                      title: 'Отключить общий чат?',
                      confirmText: 'Отключить',
                      danger: true,
                    })
                  )
                    await act('disc', disconnectTelegramGroup, () => 'Чат отключён');
                }}
              >
                <Unlink /> Отключить чат
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-1 text-sm text-ink/80">
            <p>Чтобы сводки приходили в рабочий чат:</p>
            <ol className="mt-1 list-inside list-decimal space-y-1">
              <li>
                добавьте бота {bot ? `@${bot.username}` : ''} в группу (Настройки группы → Добавить
                участника);
              </li>
              <li>
                отправьте в группу команду: <CopyText text={`/connect ${connectCode}`} />
              </li>
              <li>бот ответит «Чат подключён» — обновите эту страницу.</li>
            </ol>
          </div>
        )}
      </Card>

      {/* 4. Параметры */}
      <Card className="p-4">
        <h2 className="font-semibold">4. Параметры</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await act(
              'save',
              () =>
                saveReminderSettings({
                  daysBefore: Number(f.daysBefore),
                  weeklySummary: f.weeklySummary,
                  telegramPersonal: f.telegramPersonal,
                  telegramGroup: f.telegramGroup,
                }),
              () => 'Настройки сохранены',
            );
          }}
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-brand"
              checked={f.telegramPersonal}
              onChange={(e) => setF({ ...f, telegramPersonal: e.target.checked })}
            />
            Личные напоминания ответственным
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-brand"
              checked={f.telegramGroup}
              onChange={(e) => setF({ ...f, telegramGroup: e.target.checked })}
            />
            Ежедневная сводка в общий чат
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-brand"
              checked={f.weeklySummary}
              onChange={(e) => setF({ ...f, weeklySummary: e.target.checked })}
            />
            Еженедельная сводка в общий чат по понедельникам
          </label>
          <Field
            label="За сколько дней до срока напоминать"
            hint="По умолчанию — 3 дня"
            className="max-w-xs"
          >
            <Input
              type="number"
              min={0}
              max={60}
              value={f.daysBefore}
              onChange={(e) => setF({ ...f, daysBefore: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy !== null}>
              Сохранить
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                act('run', runRemindersNow, (r) => `Напоминаний: ${r.reminders}. ${r.message}`)
              }
            >
              <Send /> {busy === 'run' ? 'Отправляем…' : 'Отправить напоминания сейчас'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
