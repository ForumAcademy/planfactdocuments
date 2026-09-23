import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import path from 'node:path';
import { normalizeTerm, parseTerm, stageBounds, stageNumberFromName } from '@/lib/term-parser';

// F = ср 10.03.2027, FE = чт 11.03.2027, S = F − 4 мес = 10.11.2026
const refs = { forumStart: '2027-03-10', forumEnd: '2027-03-11', salesStart: '2026-11-10' };
const oneDay = { forumStart: '2027-03-10', forumEnd: null, salesStart: '2026-11-10' };

type Expected = {
  term: string;
  stage: number;
  start: string;
  end: string;
  flag?: boolean;
  milestone?: boolean;
  note?: string | null;
};

/** Все варианты сроков из мастер-плана (seed/master-plan.xlsx). */
const cases: Expected[] = [
  { term: 'до старта продаж', stage: 1, start: '2026-09-11', end: '2026-11-10' },
  {
    term: 'контрольная точка, за 4 месяца',
    stage: 1,
    start: '2026-11-10',
    end: '2026-11-10',
    milestone: true,
  },
  { term: 'за 4 месяца до форума', stage: 1, start: '2026-11-03', end: '2026-11-10' },
  { term: 'с начала продаж', stage: 2, start: '2026-11-10', end: '2027-03-09' },
  {
    term: 'с начала продаж, далее на регулярной основе',
    stage: 2,
    start: '2026-11-10',
    end: '2027-03-09',
    note: 'далее на регулярной основе',
  },
  { term: 'за 3 месяца до форума', stage: 2, start: '2026-12-03', end: '2026-12-10' },
  {
    term: 'на всем протяжении этапа, еженедельно',
    stage: 2,
    start: '2026-11-10',
    end: '2027-03-09',
    flag: true,
    note: 'еженедельно',
  },
  { term: 'за 1 день до форума', stage: 2, start: '2027-03-02', end: '2027-03-09' },
  { term: 'на протяжении этапа', stage: 2, start: '2026-11-10', end: '2027-03-09', flag: true },
  { term: 'за 8-9 недель до форума', stage: 2, start: '2027-01-06', end: '2027-01-13' },
  { term: 'за 8 недель до форума', stage: 2, start: '2027-01-06', end: '2027-01-13' },
  {
    term: 'на протяжении этапа, до 30 дней',
    stage: 4,
    start: '2027-03-12',
    end: '2027-04-10',
    flag: true,
    note: 'до 30 дней',
  },
  { term: 'за 1 месяц  до форума', stage: 2, start: '2027-02-03', end: '2027-02-10' },
  { term: 'за 6 недель  до форума', stage: 2, start: '2027-01-20', end: '2027-01-27' },
  { term: 'за 10-12 дней до форума', stage: 2, start: '2027-02-26', end: '2027-02-28' },
  { term: 'за 1 неделю до форума', stage: 2, start: '2027-02-24', end: '2027-03-03' },
  { term: 'за 4 дня до форума', stage: 2, start: '2027-02-27', end: '2027-03-06' },
  { term: 'за 2 дня до форума', stage: 2, start: '2027-03-01', end: '2027-03-08' },
  { term: 'за 10 недель до форума', stage: 2, start: '2026-12-23', end: '2026-12-30' },
  { term: 'за 6 недель до форума', stage: 2, start: '2027-01-20', end: '2027-01-27' },
  { term: 'за 5-6 недель до форума', stage: 2, start: '2027-01-27', end: '2027-02-03' },
  { term: 'за 5 недель до форума', stage: 2, start: '2027-01-27', end: '2027-02-03' },
  { term: 'за 4 недели  до форума', stage: 2, start: '2027-02-03', end: '2027-02-10' },
  { term: 'за 4 недели до форума', stage: 2, start: '2027-02-03', end: '2027-02-10' },
  { term: 'за 3 дня до форума', stage: 2, start: '2027-02-28', end: '2027-03-07' },
  { term: 'за 10 недель  до форума', stage: 2, start: '2026-12-23', end: '2026-12-30' },
  { term: 'при выборе площадки', stage: 1, start: '2026-09-11', end: '2026-11-10', flag: true },
  { term: 'за 8 дней до форума', stage: 2, start: '2027-02-23', end: '2027-03-02' },
  {
    term: 'за 2 дня до форума (утверждение); бриф — на этапе финализации сценария',
    stage: 2,
    start: '2027-03-07',
    end: '2027-03-08',
    note: 'утверждение; бриф — на этапе финализации сценария',
  },
  { term: 'за 3 недели до форума', stage: 2, start: '2027-02-10', end: '2027-02-17' },
  { term: 'за 1 месяц до форума', stage: 2, start: '2027-02-03', end: '2027-02-10' },
  { term: 'за 2 недели до форума', stage: 2, start: '2027-02-17', end: '2027-02-24' },
  {
    term: 'на протяжении этапа, не позднее 2 недель до форума',
    stage: 2,
    start: '2026-11-10',
    end: '2027-02-24',
  },
  {
    term: 'по графику платежей договоров',
    stage: 2,
    start: '2026-11-10',
    end: '2027-03-09',
    flag: true,
  },
  { term: 'период монтажа, за 1 день до форума', stage: 3, start: '2027-03-09', end: '2027-03-09' },
  {
    term: 'за 1 день до форума, к 18:00',
    stage: 3,
    start: '2027-03-08',
    end: '2027-03-09',
    note: 'к 18:00',
  },
  { term: 'в день монтажа', stage: 3, start: '2027-03-09', end: '2027-03-09' },
  {
    term: 'за 1 день до форума (при невозможности — за 1 час до сессии на площадке в день форума)',
    stage: 3,
    start: '2027-03-08',
    end: '2027-03-09',
    note: 'при невозможности — за 1 час до сессии на площадке в день форума',
  },
  { term: 'в дни форума', stage: 3, start: '2027-03-10', end: '2027-03-11' },
  {
    term: 'в день окончания форума / на следующий день',
    stage: 4,
    start: '2027-03-11',
    end: '2027-03-12',
  },
  { term: 'на следующий день после форума', stage: 4, start: '2027-03-12', end: '2027-03-12' },
  { term: 'в течение 2 дней после форума', stage: 4, start: '2027-03-12', end: '2027-03-13' },
  { term: 'в течение 4 дней после форума', stage: 4, start: '2027-03-12', end: '2027-03-15' },
  { term: 'в течение 5 дней после форума', stage: 4, start: '2027-03-12', end: '2027-03-16' },
  // 11.03.2027 — четверг: пт 12, пн 15, вт 16, ср 17, чт 18
  {
    term: 'в течение 5 рабочих дней после форума',
    stage: 4,
    start: '2027-03-12',
    end: '2027-03-18',
  },
  { term: 'в течение 10 дней после форума', stage: 4, start: '2027-03-12', end: '2027-03-21' },
  { term: 'в течение 7 дней после форума', stage: 4, start: '2027-03-12', end: '2027-03-18' },
  { term: 'в течение 30 дней после форума', stage: 4, start: '2027-03-12', end: '2027-04-10' },
];

describe('parseTerm — все варианты мастер-плана', () => {
  it.each(cases)('$term', (c) => {
    const r = parseTerm(c.term, refs, c.stage);
    expect({ start: r.start, end: r.end }).toEqual({ start: c.start, end: c.end });
    expect(r.needsClarification).toBe(c.flag ?? false);
    expect(r.milestone).toBe(c.milestone ?? false);
    if (c.note !== undefined) expect(r.note).toBe(c.note);
    expect(r.start <= r.end).toBe(true);
  });

  it('покрывает каждый срок из seed/master-plan.xlsx', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.resolve(__dirname, '../../seed/master-plan.xlsx'));
    const ws = wb.worksheets[0];
    const terms = new Set<string>();
    ws.eachRow((row, i) => {
      if (i === 1) return;
      const v = row.getCell(5).value;
      if (typeof v === 'string') terms.add(normalizeTerm(v));
    });
    const known = new Set(cases.map((c) => normalizeTerm(c.term)));
    const missing = [...terms].filter((t) => !known.has(t));
    expect(missing).toEqual([]);
    expect(terms.size).toBeGreaterThan(40);
  });
});

describe('parseTerm — прочее', () => {
  it('однодневный форум: FE = F', () => {
    const r = parseTerm('в дни форума', oneDay, 3);
    expect(r).toMatchObject({ start: '2027-03-10', end: '2027-03-10' });
    expect(parseTerm('на следующий день после форума', oneDay, 4).end).toBe('2027-03-11');
  });

  it('регистр и лишние пробелы не мешают', () => {
    expect(parseTerm('  ЗА  2  НЕДЕЛИ   до Форума ', refs, 2).end).toBe('2027-02-24');
    expect(parseTerm('за 8–9 недель до форума', refs, 2).start).toBe('2027-01-06');
  });

  it('пустой или нераспознанный срок — границы этапа и флаг', () => {
    expect(parseTerm('', refs, 3)).toMatchObject({
      start: '2027-03-10',
      end: '2027-03-11',
      needsClarification: true,
    });
    expect(parseTerm('когда-нибудь', refs, 4)).toMatchObject({
      start: '2027-03-12',
      end: '2027-04-10',
      needsClarification: true,
    });
    expect(parseTerm(null, refs, null).needsClarification).toBe(true);
  });

  it('границы этапов', () => {
    expect(stageBounds(1, refs)).toEqual({ start: '2026-09-11', end: '2026-11-10' });
    expect(stageBounds(2, refs)).toEqual({ start: '2026-11-10', end: '2027-03-09' });
    expect(stageBounds(3, refs)).toEqual({ start: '2027-03-10', end: '2027-03-11' });
    expect(stageBounds(4, refs)).toEqual({ start: '2027-03-12', end: '2027-04-10' });
  });

  it('номер этапа из названия', () => {
    expect(stageNumberFromName('2. Продажи и орг. подготовка')).toBe(2);
    expect(stageNumberFromName('Без номера')).toBeNull();
  });

  it('месяцы считаются календарно (31.05 − 1 мес = 30.04)', () => {
    const r = parseTerm(
      'за 1 месяц до форума',
      { forumStart: '2027-05-31', salesStart: '2027-01-31' },
      2,
    );
    expect(r.end).toBe('2027-04-30');
  });
});
