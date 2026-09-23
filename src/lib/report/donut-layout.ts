import { paletteShades, type PaletteKey } from './palette';

export interface ChartItem {
  name: string;
  amount: number;
  /** Дополнительная единица в скобках: «6 шт.» */
  note?: string | null;
}

/** «Партнерства; 8,48 (7 шт.)» */
export function itemLabel(name: string, amount: string, note?: string | null): string {
  // Доп. единица не разрывается между строками (неразрывные пробелы)
  return `${name}; ${amount}${note ? `\u00a0(${note.replace(/ /g, '\u00a0')})` : ''}`;
}

export interface Segment {
  index: number;
  name: string;
  amount: number;
  note: string | null;
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
      note: i.note ?? null,
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
  // Делим только по обычным пробелам — неразрывные сохраняют слова вместе
  const words = s.split(/ +/).filter(Boolean);
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
    const name = wrapText(itemLabel(s.name, o.formatAmount(s.amount), s.note), o.maxChars, 3);
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

/** Тёмный ли цвет (для выбора белого или чёрного текста поверх). */
export function isDarkColor(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
}

export interface InsideLabel {
  segment: Segment;
  x: number;
  y: number;
  text: string;
  dark: boolean;
}

/** Проценты внутри сегментов кольца — только для достаточно крупных сегментов. */
export function insideLabels(
  segments: Segment[],
  cx: number,
  cy: number,
  midR: number,
  minPct = 4,
): InsideLabel[] {
  return segments
    .filter((s) => s.pct >= minPct)
    .map((s) => {
      const p = polar(cx, cy, midR, s.mid);
      // Округляем: сервер и браузер считают тригонометрию с разницей в последнем знаке
      const x = Math.round(p.x * 10) / 10;
      const y = Math.round(p.y * 10) / 10;
      return { segment: s, x, y, text: formatPct(s.pct), dark: isDarkColor(s.color) };
    });
}

/* ---------- Радиальная («спиральная») диаграмма ---------- */

/** Первый (самый крупный) сектор начинается с «9 часов» и идёт по часовой стрелке. */
export const RADIAL_START = -Math.PI / 2;

export interface RadialSector {
  segment: Segment;
  /** Углы с учётом поворота, радианы от «12 часов» по часовой стрелке */
  a0: number;
  a1: number;
  /** Внешний радиус сектора */
  r: number;
  /** Подпись процента внутри сектора (если помещается) */
  label: { x: number; y: number; text: string; dark: boolean } | null;
}

export interface RadialLayout {
  /** Радиус белого круга в центре */
  hole: number;
  /** Радиусы тонких фоновых окружностей */
  rings: number[];
  sectors: RadialSector[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Ширина сектора — доля статьи; длина убывает от крупной статьи к мелкой (спираль).
 * Первый сектор достаёт до outerR, последний — примерно до 60 % радиуса.
 */
export function radialLayout(
  segments: Segment[],
  cx: number,
  cy: number,
  outerR: number,
  fontPx = 12,
): RadialLayout {
  const hole = outerR * 0.34;
  const minR = outerR * 0.6;
  const n = segments.length;
  const rings = [0.5, 0.64, 0.78, 0.92, 1].map((k) => r1(outerR * k));
  const sectors = segments.map((s, k) => {
    const r = n > 1 ? outerR - ((outerR - minR) * k) / (n - 1) : outerR;
    const a0 = s.start + RADIAL_START;
    const a1 = s.end + RADIAL_START;
    const mid = (a0 + a1) / 2;
    const lr = hole + (r - hole) * 0.56;
    const text = formatPct(s.pct);
    // Подпись — если по дуге хватает места под текст
    const fits = (a1 - a0) * lr >= text.length * fontPx * 0.55 + 6 && r - hole > fontPx * 2;
    const p = polar(cx, cy, lr, mid);
    return {
      segment: s,
      a0,
      a1,
      r: r1(r),
      label: fits ? { x: r1(p.x), y: r1(p.y), text, dark: isDarkColor(s.color) } : null,
    };
  });
  return { hole: r1(hole), rings, sectors };
}

/** Точки контура сектора (для PDF): внешняя дуга, затем центр круга. */
export function sectorPoints(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
): { x: number; y: number }[] {
  const steps = Math.max(2, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 180));
  const arc = Array.from({ length: steps + 1 }, (_, i) =>
    polar(cx, cy, r, a0 + ((a1 - a0) * i) / steps),
  );
  return a1 - a0 >= Math.PI * 2 - 1e-6 ? arc : [{ x: cx, y: cy }, ...arc];
}

/** SVG-контур сектора от центра (белый круг в центре закрывает середину). */
export function sectorPathD(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const f = (n: number) => n.toFixed(2);
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const top = polar(cx, cy, r, a0);
    const bottom = polar(cx, cy, r, a0 + Math.PI);
    return `M${f(top.x)} ${f(top.y)}A${f(r)} ${f(r)} 0 1 1 ${f(bottom.x)} ${f(bottom.y)}A${f(r)} ${f(r)} 0 1 1 ${f(top.x)} ${f(top.y)}Z`;
  }
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${f(cx)} ${f(cy)}L${f(p0.x)} ${f(p0.y)}A${f(r)} ${f(r)} 0 ${large} 1 ${f(p1.x)} ${f(p1.y)}Z`;
}

/** Полная SVG-картинка диаграммы — для вставки в PPTX (рисуется в браузере). */
export function radialSvg(
  segments: Segment[],
  opts: { size: number; total: string; unit: string; font?: string },
): string {
  const { size } = opts;
  const c = size / 2;
  const outerR = size / 2 - 4;
  const font = opts.font ?? 'Arial, sans-serif';
  const fs = Math.round(size / 26);
  const L = radialLayout(segments, c, c, outerR, fs);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    ...L.rings.map(
      (r) =>
        `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#E3E7EF" stroke-width="${size / 400}"/>`,
    ),
    ...L.sectors.map(
      (s) =>
        `<path d="${sectorPathD(c, c, s.r, s.a0, s.a1)}" fill="${s.segment.color}" stroke="#FFFFFF" stroke-width="${size / 300}"/>`,
    ),
    `<circle cx="${c}" cy="${c}" r="${L.hole + size / 200}" fill="#000000" opacity="0.06"/>`,
    `<circle cx="${c}" cy="${c}" r="${L.hole}" fill="#FFFFFF"/>`,
    ...L.sectors
      .filter((s) => s.label)
      .map(
        (s) =>
          `<text x="${s.label!.x}" y="${s.label!.y}" text-anchor="middle" dominant-baseline="central" font-family="${font}" font-size="${fs}" font-weight="700" fill="${s.label!.dark ? '#FFFFFF' : '#111111'}">${esc(s.label!.text)}</text>`,
      ),
    `<text x="${c}" y="${c - fs * 0.25}" text-anchor="middle" font-family="${font}" font-size="${Math.round(L.hole * 0.42)}" font-weight="700" fill="#111111">${esc(opts.total)}</text>`,
    `<text x="${c}" y="${c + L.hole * 0.38}" text-anchor="middle" font-family="${font}" font-size="${Math.round(fs * 0.9)}" fill="#555555">${esc(opts.unit)}</text>`,
    '</svg>',
  ];
  return parts.join('');
}
