import { describe, expect, it } from 'vitest';
import { forumSchema, normalizeWebsite } from '@/lib/validation';

describe('normalizeWebsite', () => {
  it('дополняет https:// и проверяет адрес', () => {
    expect(normalizeWebsite('forum.ru')).toBe('https://forum.ru');
    expect(normalizeWebsite(' https://www.forum.ru/ ')).toBe('https://www.forum.ru');
    expect(normalizeWebsite('http://forum.ru/2026')).toBe('http://forum.ru/2026');
    expect(normalizeWebsite('')).toBeNull();
    expect(normalizeWebsite(null)).toBeNull();
    expect(normalizeWebsite('просто текст')).toBeUndefined();
    expect(normalizeWebsite('forum')).toBeUndefined();
  });

  it('в схеме форума: пусто — null, ошибка — сообщение', () => {
    const base = { name: 'Ф', startDate: '2027-02-10', salesStartDate: '2026-10-01' };
    const ok = forumSchema.parse({ ...base, website: 'stroitech.ru' });
    expect(ok.website).toBe('https://stroitech.ru');
    expect(forumSchema.parse(base).website).toBeNull();
    const bad = forumSchema.safeParse({ ...base, website: 'не сайт' });
    expect(bad.success).toBe(false);
  });
});
