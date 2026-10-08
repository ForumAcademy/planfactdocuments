import { describe, expect, it } from 'vitest';
import { formatUnitValue, unitNumFmt } from '@/lib/report/units';

describe('формат чисел по единице диаграммы', () => {
  it('млн руб. — два знака', () => {
    expect(formatUnitValue(6.2, 'млн руб.')).toBe('6,20');
  });
  it('штуки — целые, дробь только если есть', () => {
    expect(formatUnitValue(37, 'шт.')).toBe('37');
    expect(formatUnitValue(2.5, 'шт.')).toBe('2,5');
    expect(formatUnitValue(1250, 'билетов')).toBe('1 250');
  });
  it('рубли — без копеек', () => {
    expect(formatUnitValue(1234.56, 'руб.')).toBe('1 235');
    expect(unitNumFmt('руб.')).toBe('#,##0');
    expect(unitNumFmt('млн руб.')).toBe('#,##0.00');
  });
});
