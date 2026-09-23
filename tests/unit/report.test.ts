import { describe, expect, it } from 'vitest';
import { chartTotal, computeSegments, layoutLabels, wrapText } from '@/lib/report/donut-layout';
import { paletteShades } from '@/lib/report/palette';
import { formatAmount, parseAmount } from '@/lib/utils';

const expenses = [
  { name: 'Прочее', amount: 0.49 },
  { name: 'Персонал', amount: 3.92 },
  { name: 'Площадка', amount: 1.81 },
  { name: 'Питание', amount: 1.24 },
  { name: 'Маркетинг', amount: 1.07 },
  { name: 'Деловая программа', amount: 0.99 },
  { name: 'Трансфер и логистика', amount: 0.22 },
  { name: 'Мелочь', amount: 0.01 },
  { name: 'Ещё мелочь', amount: 0.02 },
];

describe('отчёт', () => {
  it('итог и числа с запятой', () => {
    expect(
      chartTotal([
        { name: 'a', amount: 6.21 },
        { name: 'b', amount: 8.48 },
      ]),
    ).toBe(14.69);
    expect(formatAmount(14.69)).toBe('14,69');
    expect(formatAmount(1234.5)).toBe('1 234,50');
    expect(parseAmount('1 234,56')).toBe(1234.56);
    expect(parseAmount('6.21')).toBe(6.21);
    expect(parseAmount('abc')).toBeNull();
  });

  it('гаммы: от тёмного к светлому', () => {
    expect(paletteShades('RED', 3)).toEqual(['#7F1D1D', expect.any(String), '#FCA5A5']);
    expect(paletteShades('GREEN', 1)).toEqual(['#14532D']);
    expect(paletteShades('BLUE', 2)).toEqual(['#060670', '#93C5FD']);
  });

  it('сегменты отсортированы по убыванию, углы покрывают круг', () => {
    const s = computeSegments(expenses, 'RED');
    expect(s[0].name).toBe('Персонал');
    expect(s.map((x) => x.amount)).toEqual([...s.map((x) => x.amount)].sort((a, b) => b - a));
    expect(s.at(-1)!.end).toBeCloseTo(Math.PI * 2);
    expect(s.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(100);
  });

  it('подписи не перекрываются', () => {
    const segs = computeSegments(expenses, 'RED');
    const labels = layoutLabels(segs, {
      cx: 300,
      cy: 200,
      outerR: 120,
      elbow: 16,
      shelf: 14,
      lineHeight: 14,
      gap: 4,
      maxChars: 22,
      top: 10,
      bottom: 390,
      formatAmount: (n) => n.toFixed(2),
    });
    expect(labels).toHaveLength(segs.length);
    for (const side of ['left', 'right'] as const) {
      const list = labels.filter((l) => l.align === side).sort((a, b) => a.textY - b.textY);
      for (let i = 1; i < list.length; i++) {
        const prevBottom = list[i - 1].textY + list[i - 1].lines.length * 14;
        expect(list[i].textY).toBeGreaterThanOrEqual(prevBottom);
      }
    }
  });

  it('перенос длинных подписей', () => {
    expect(wrapText('Отдел продаж, 43 билета, 3 партнерства; 6,71', 22)).toEqual([
      'Отдел продаж, 43',
      'билета, 3 партнерства;',
      '6,71',
    ]);
  });
});
