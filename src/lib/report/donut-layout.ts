import { paletteShades, type PaletteKey } from './palette';

export interface ChartItem {
  name: string;
  amount: number;
}

export interface Segment {
  index: number;
  name: string;
  amount: number;
  pct: number;
  color: string;
  /** Углы в радианах от «12 часов» по часовой стрелке. */
  start: number;
  end: number;
  mid: number;
}

export function chartTotal(items: ChartItem[]): number {
  return round2(items.reduce((s, i) => s + (Number.isFinite(i.amount) ? i.amount : 0), 0));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Сегменты по убыванию суммы, цвета — от тёмного к светлому. */
export function computeSegments(items: ChartItem[], palette: PaletteKey): Segment[] {
  const valid = items
    .map((i, idx) => ({ ...i, idx }))
    .filter((i) => i.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.idx - b.idx);
  const total = valid.reduce((s, i) => s + i.amount, 0);
  const colors = paletteShades(palette, valid.length);
  let acc = 0;
  return valid.map((i, k) => {
    const frac = total ? i.amount / total : 0;
    const start = acc * Math.PI * 2;
    acc += frac;
    const end = acc * Math.PI * 2;
    return {
      index: k,
      name: i.name,
      amount: i.amount,
      pct: frac * 100,
      color: colors[k],
      start,
      end,
      mid: (start + end) / 2,
    };
  });
}

/** Точка на окружности: угол от «12 часов» по часовой стрелке. */
export function polar(cx: number, cy: number, r: number, a: number): { x: number; y: number } {
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

export function formatPct(p: number): string {
  if (p > 0 && p < 1) return `${p.toFixed(1).replace('.', ',')} %`;
  return `${Math.round(p)} %`;
}

/** Переносит текст по словам на строки не длиннее max символов. */
export function wrapText(s: string, max: number, maxLines = 3): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines);
    head[maxLines - 1] = `${head[maxLines - 1].slice(0, max - 1)}…`;
    return head;
  }
  return lines;
}

export interface LabelLayout {
  segment: Segment;
  /** Точка на внешнем краю кольца */
  p0: { x: number; y: number };
  /** Излом выноски */
  p1: { x: number; y: number };
  /** Конец горизонтальной полки */
  p2: { x: number; y: number };
  align: 'left' | 'right';
  /** Верх блока текста */
  textY: number;
  lines: string[];
}

export interface LabelOptions {
  cx: number;
  cy: number;
  outerR: number;
  /** Отступ излома от кольца */
  elbow: number;
  /** Длина горизонтальной полки */
  shelf: number;
  lineHeight: number;
  /** Промежуток между подписями */
  gap: number;
  /** Макс. длина строки подписи в символах */
  maxChars: number;
  /** Вертикальные границы области подписей */
  top: number;
  bottom: number;
  formatAmount: (n: number) => string;
}

/**
 * Раскладывает подписи «Название; сумма / процент» по сторонам кольца с выносками,
 * раздвигая их по вертикали, чтобы не перекрывались.
 */
export function layoutLabels(segments: Segment[], o: LabelOptions): LabelLayout[] {
  const items = segments.map((s) => {
    const right = Math.sin(s.mid) >= 0;
    const p0 = polar(o.cx, o.cy, o.outerR, s.mid);
    const pe = polar(o.cx, o.cy, o.outerR + o.elbow, s.mid);
    const name = wrapText(`${s.name}; ${o.formatAmount(s.amount)}`, o.maxChars, 3);
    const lines = [...name, formatPct(s.pct)];
    const h = lines.length * o.lineHeight;
    return { s, right, p0, desiredY: pe.y, h, lines };
  });

  const out: LabelLayout[] = [];
  for (const side of [true, false]) {
    const list = items.filter((i) => i.right === side).sort((a, b) => a.desiredY - b.desiredY);
    // центр блока текста — на уровне излома; раздвигаем вниз, затем поджимаем вверх от нижней границы
    const ys = list.map((i) => i.desiredY - i.h / 2);
    for (let k = 0; k < list.length; k++) {
      const minY = k === 0 ? o.top : ys[k - 1] + list[k - 1].h + o.gap;
      ys[k] = Math.max(ys[k], minY);
    }
    for (let k = list.length - 1; k >= 0; k--) {
      const maxY = k === list.length - 1 ? o.bottom - list[k].h : ys[k + 1] - o.gap - list[k].h;
      ys[k] = Math.min(ys[k], maxY);
    }
    list.forEach((i, k) => {
      const midY = ys[k] + i.h / 2;
      const dx = Math.sqrt(Math.max(0, (o.outerR + o.elbow) ** 2 - (midY - o.cy) ** 2));
      const elbowX = side
        ? o.cx + Math.max(dx, o.outerR * 0.3)
        : o.cx - Math.max(dx, o.outerR * 0.3);
      const p1 = { x: elbowX, y: midY };
      const p2 = { x: side ? elbowX + o.shelf : elbowX - o.shelf, y: midY };
      out.push({
        segment: i.s,
        p0: i.p0,
        p1,
        p2,
        align: side ? 'left' : 'right',
        textY: ys[k],
        lines: i.lines,
      });
    });
  }
  return out.sort((a, b) => a.segment.index - b.segment.index);
}
