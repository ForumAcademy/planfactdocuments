import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseFunnelWorkbook, parseStatus } from '@/lib/excel/funnel-excel';
import {
  breakdown,
  funnelAdvice,
  funnelStats,
  isStale,
  reachedIndex,
  type DealValue,
} from '@/lib/funnel';

let id = 0;
function deal(p: Partial<DealValue>): DealValue {
  return {
    id: ++id,
    company: `Компания ${id}`,
    source: '',
    manager: '',
    enteredAt: '2026-09-01',
    incomeKey: null,
    qty: 0,
    amount: 0,
    status: 'qualification',
    lostStage: null,
    stageChangedAt: null,
    decisionDate: null,
    paidDate: null,
    comment: '',
    incomeStatus: null,
    incomeItemKey: null,
    ...p,
  };
}

describe('funnelStats', () => {
  const deals = [
    deal({ status: 'qualification' }),
    deal({ status: 'qualification' }),
    deal({ status: 'refused', lostStage: 'negotiation', amount: 100 }),
    deal({ status: 'refused' }),
    deal({ status: 'invoice', amount: 300 }),
    deal({ status: 'paid', amount: 500 }),
  ];

  it('считает, сколько дошло до этапа, с учётом отказов на нём', () => {
    const s = funnelStats(deals, '2026-09-10');
    expect(s.map((x) => x.reached)).toEqual([6, 3, 2, 2, 1]);
    expect(s.map((x) => x.current)).toEqual([2, 0, 0, 1, 1]);
    expect(s.map((x) => x.lost)).toEqual([1, 1, 0, 0, 0]);
    expect(s[1].conversion).toBeCloseTo(0.5);
    expect(s[4].conversion).toBeCloseTo(0.5);
  });

  it('отказ без этапа — на «Квалификации»', () => {
    expect(reachedIndex({ status: 'refused', lostStage: null })).toBe(0);
    expect(reachedIndex({ status: 'refused', lostStage: 'agreement' })).toBe(2);
  });

  it('сделка зависла, если стоит на этапе дольше нормы', () => {
    expect(isStale(deal({ enteredAt: '2026-09-01' }), '2026-09-30')).toBe(true);
    expect(isStale(deal({ enteredAt: '2026-09-20' }), '2026-09-30')).toBe(false);
    expect(isStale(deal({ status: 'paid', enteredAt: '2026-01-01' }), '2026-09-30')).toBe(false);
  });

  it('разбивка по источнику', () => {
    const b = breakdown(
      [deal({ source: 'Аутрич' }), deal({ source: 'Аутрич' }), deal({})],
      (d) => d.source,
    );
    expect(b.map((x) => [x.name, x.count])).toEqual([
      ['Аутрич', 2],
      ['Не указано', 1],
    ]);
  });
});

describe('funnelAdvice', () => {
  it('находит самый слабый переход и источник с отказами', () => {
    const deals = [
      ...Array.from({ length: 10 }, () =>
        deal({ status: 'refused', lostStage: 'negotiation', source: 'Аутрич', amount: 10 }),
      ),
      deal({ status: 'agreement', source: 'Участник', amount: 50 }),
      deal({ status: 'paid', source: 'Участник', amount: 100 }),
      deal({ status: 'paid', source: 'Участник', amount: 100 }),
    ];
    const a = funnelAdvice(deals, '2026-09-10', { forumStart: '2026-11-01', planSum: 1000 });
    const titles = a.map((x) => x.title).join('\n');
    expect(titles).toContain('«Переговоры» → «Согласование»');
    expect(titles).toContain('«Аутрич»: 10 отказов из 10');
    expect(titles).toContain('До плана не хватает');
    expect(a[0].level).toBe('problem');
  });
});

describe('Excel воронки', () => {
  it('распознаёт статусы свода', () => {
    expect(parseStatus('0. Отказ')).toBe('refused');
    expect(parseStatus('1. Квалификация')).toBe('qualification');
    expect(parseStatus('3. Согласование')).toBe('agreement');
    expect(parseStatus('4. Выставлен счет')).toBe('invoice');
    expect(parseStatus('5. Оплачен')).toBe('paid');
  });

  it('читает лист «воронка»: даты строкой и датой, этап отказа по сумме', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Свод');
    const ws = wb.addWorksheet('воронка');
    ws.addRow([
      'Компания',
      'Откуда пришел',
      'Дата входа в воронку',
      'Кол-во билетов',
      'Сумма',
      'Статус текущий',
      'Дата решения/оплаты',
      'Дата оплаты',
      'Кто ведет',
    ]);
    ws.addRow([
      'ООО «А»',
      'Участник',
      '29.12.2025',
      1,
      336000,
      '5. Оплачен',
      null,
      new Date(Date.UTC(2026, 0, 29)),
      'Антонов',
    ]);
    ws.addRow([
      'Б',
      'Аутрич',
      new Date(Date.UTC(2026, 8, 10)),
      1,
      520000,
      '0. Отказ',
      null,
      null,
      'Павлова',
    ]);
    ws.addRow(['В', 'МНК', null, null, null, '0. Отказ', null, null, '']);
    ws.addRow(['Г', 'МНК', null, null, null, 'непонятно', null, null, '']);
    const buf = await wb.xlsx.writeBuffer();
    const p = await parseFunnelWorkbook(buf as ArrayBuffer);
    expect(p.sheetName).toBe('воронка');
    expect(p.deals).toHaveLength(3);
    expect(p.deals[0]).toMatchObject({
      company: 'ООО «А»',
      enteredAt: '2025-12-29',
      paidDate: '2026-01-29',
      status: 'paid',
      qty: 1,
      amount: 336000,
    });
    expect(p.deals[1]).toMatchObject({
      status: 'refused',
      lostStage: 'negotiation',
      enteredAt: '2026-09-10',
    });
    expect(p.deals[2]).toMatchObject({ status: 'refused', lostStage: 'qualification' });
    expect(p.skipped).toHaveLength(1);
  });
});
