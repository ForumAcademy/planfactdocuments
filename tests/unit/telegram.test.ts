import { describe, expect, it } from 'vitest';
import {
  formatGroupDaily,
  formatPersonalDigest,
  formatWeekly,
  normalizeTgUsername,
  splitMessage,
  type TgItem,
} from '@/lib/telegram-format';

const item = (p: Partial<TgItem>): TgItem => ({
  kind: 'overdue',
  taskId: 1,
  number: 5,
  description: 'Согласовать <площадку> & договор',
  status: 'IN_PROGRESS',
  endDate: '2026-09-20',
  lag: 3,
  forumId: 1,
  forumName: 'СтройТех’26',
  employees: ['Иванова А. С.'],
  ...p,
});

describe('Telegram', () => {
  it('ник: разные формы записи', () => {
    expect(normalizeTgUsername('@Ivanova_A')).toBe('ivanova_a');
    expect(normalizeTgUsername('https://t.me/ivanova')).toBe('ivanova');
    expect(normalizeTgUsername('ivanova')).toBe('ivanova');
    expect(normalizeTgUsername('иванова')).toBeNull();
    expect(normalizeTgUsername('')).toBeNull();
  });

  it('личный дайджест: группировка, экранирование HTML', () => {
    const text = formatPersonalDigest('Иванова', [
      item({}),
      item({ taskId: 2, number: 7, kind: 'due_soon', lag: 0, description: 'Макет' }),
    ]);
    expect(text).toContain('🔴 Просрочено (1)');
    expect(text).toContain('🔵 Скоро срок (1)');
    expect(text).toContain('&lt;площадку&gt; &amp; договор');
    expect(text).toContain('<b>+3 дн.</b>');
    expect(text.indexOf('Просрочено')).toBeLessThan(text.indexOf('Скоро срок'));
  });

  it('сводка в чат — с ответственными', () => {
    expect(formatGroupDaily([item({})], '2026-09-23')).toContain('— Иванова А. С.');
  });

  it('еженедельная сводка', () => {
    const t = formatWeekly(
      [
        {
          name: 'Форум',
          date: '2027-02-23',
          total: 10,
          done: 4,
          inProgress: 3,
          overdue: [{ number: 2, description: 'X', lag: 5 }],
        },
      ],
      '2026-09-21',
    );
    expect(t).toContain('🟢 выполнено: 4');
    expect(t).toContain('1. №2. X — <b>+5 дн.</b>');
  });

  it('длинные сообщения делятся на части по строкам', () => {
    const long = Array.from({ length: 400 }, (_, i) => `строка ${i} ${'x'.repeat(20)}`).join('\n');
    const parts = splitMessage(long, 1000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 1000)).toBe(true);
    expect(parts.join('\n')).toBe(long);
  });
});

describe('appUrl / canLinkButton', () => {
  it('дописывает https:// и убирает лишнее', async () => {
    const { appUrl, canLinkButton } = await import('@/lib/telegram-format');
    expect(appUrl({ APP_URL: 'planfactdocuments.vercel.app' })).toBe(
      'https://planfactdocuments.vercel.app',
    );
    expect(appUrl({ APP_URL: ' https://site.ru/ ' })).toBe('https://site.ru');
    expect(appUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' })).toBe('https://x.vercel.app');
    expect(appUrl({})).toBeUndefined();
    expect(canLinkButton('https://x.vercel.app')).toBe(true);
    expect(canLinkButton('http://localhost:3000')).toBe(false);
    expect(canLinkButton(undefined)).toBe(false);
  });
});
