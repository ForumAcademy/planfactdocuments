import PptxGenJS from 'pptxgenjs';
import { formatDate } from '../dates';
import { formatAmount } from '../utils';
import { chartTotal, computeSegments, formatPct, radialSvg, type Segment } from './donut-layout';
import {
  BRAND,
  BRAND_DARK,
  GRAY,
  INK,
  exportFileName,
  forumDates,
  type ReportExportData,
} from './export-common';

const FONT = 'Arial';

/** Рисует диаграмму в PNG (в браузере через canvas) для вставки на слайд. */
async function radialPng(segs: Segment[], total: string, unit: string): Promise<string> {
  const size = 1200;
  const svg = radialSvg(segs, { size, total, unit, font: 'Arial, sans-serif' });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Не удалось нарисовать диаграмму'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d')!.drawImage(img, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
const W = 13.333;
const H = 7.5;

function footer(slide: PptxGenJS.Slide, page: number, d: ReportExportData) {
  slide.addText(`${d.forum.name} · отчёт на ${formatDate(d.reportDate)}`, {
    x: 0.4,
    y: H - 0.45,
    w: 8,
    h: 0.3,
    fontFace: FONT,
    fontSize: 10,
    color: GRAY,
  });
  slide.addText(String(page), {
    x: W - 1.0,
    y: H - 0.45,
    w: 0.6,
    h: 0.3,
    fontFace: FONT,
    fontSize: 10,
    color: GRAY,
    align: 'right',
  });
}

/** Презентация PPTX: титульный слайд и по слайду на диаграмму (нативные doughnut-диаграммы). */
export async function buildPptx(d: ReportExportData): Promise<PptxGenJS> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13,33 × 7,5 дюйма (16:9)
  pptx.author = 'Статус форумы';
  pptx.company = 'Статус форумы';
  pptx.title = `Отчёт — ${d.forum.name}`;

  // Титульный слайд
  const title = pptx.addSlide();
  title.background = { color: 'FFFFFF' };
  title.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 4.3, fill: { color: BRAND } });
  title.addShape(pptx.ShapeType.rect, { x: 0, y: 4.3, w: W, h: 0.12, fill: { color: BRAND_DARK } });
  title.addText('Отчёт', {
    x: 0.8,
    y: 1.0,
    w: 11,
    h: 0.6,
    fontFace: FONT,
    fontSize: 22,
    color: 'D6D6F5',
  });
  title.addText(d.forum.name, {
    x: 0.8,
    y: 1.7,
    w: 11.5,
    h: 1.3,
    fontFace: FONT,
    fontSize: 44,
    bold: true,
    color: 'FFFFFF',
  });
  title.addText(
    [
      { text: 'Дата форума: ', options: { color: GRAY } },
      { text: forumDates(d.forum), options: { color: INK, bold: true, breakLine: true } },
      { text: 'Дата составления отчёта: ', options: { color: GRAY } },
      { text: formatDate(d.reportDate), options: { color: INK, bold: true } },
    ],
    { x: 0.8, y: 4.9, w: 11, h: 1.2, fontFace: FONT, fontSize: 18, lineSpacingMultiple: 1.3 },
  );
  footer(title, 1, d);

  for (const [i, c] of d.charts.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.95, fill: { color: BRAND } });
    slide.addText(c.title, {
      x: 0.4,
      y: 0.12,
      w: 8.5,
      h: 0.7,
      fontFace: FONT,
      fontSize: 26,
      bold: true,
      color: 'FFFFFF',
    });
    slide.addText(d.forum.name, {
      x: 8.9,
      y: 0.12,
      w: 4.0,
      h: 0.7,
      fontFace: FONT,
      fontSize: 14,
      color: 'D6D6F5',
      align: 'right',
    });

    const segs = computeSegments(c.items, c.palette);
    const total = chartTotal(c.items);
    if (segs.length) {
      // Диаграмма с секторами разной длины — картинкой (в PowerPoint нет такого типа)
      const side = 5.6;
      slide.addImage({
        data: await radialPng(segs, formatAmount(total), c.unit),
        x: 0.3 + (7.4 - side) / 2,
        y: 1.2,
        w: side,
        h: side,
        altText: `${c.title}: ${segs.map((s) => `${s.name} ${formatPct(s.pct)}`).join(', ')}`,
      });
    } else {
      slide.addText('Нет данных', {
        x: 0.4,
        y: 3.5,
        w: 7.2,
        h: 0.6,
        align: 'center',
        fontFace: FONT,
        fontSize: 18,
        color: GRAY,
      });
    }

    // Таблица-легенда справа: цвет, название, сумма, доля
    const rows: PptxGenJS.TableRow[] = [
      [
        { text: '', options: { fill: { color: 'F4F6FA' } } },
        { text: 'Название', options: { bold: true, fill: { color: 'F4F6FA' } } },
        { text: c.unit, options: { bold: true, align: 'right', fill: { color: 'F4F6FA' } } },
        { text: 'Доля', options: { bold: true, align: 'right', fill: { color: 'F4F6FA' } } },
      ],
      ...segs.map((s): PptxGenJS.TableRow => [
        { text: '', options: { fill: { color: s.color.replace('#', '') } } },
        { text: s.name },
        {
          text: formatAmount(s.amount) + (s.note ? ` (${s.note})` : ''),
          options: { align: 'right' },
        },
        { text: formatPct(s.pct), options: { align: 'right', color: '555555' } },
      ]),
      [
        { text: '' },
        { text: 'Итого', options: { bold: true } },
        { text: formatAmount(total), options: { bold: true, align: 'right' } },
        { text: total > 0 ? '100 %' : '—', options: { bold: true, align: 'right' } },
      ],
    ];
    slide.addTable(rows, {
      x: 7.9,
      y: 1.35,
      w: 5.0,
      colW: [0.22, 2.58, 1.4, 0.8],
      fontFace: FONT,
      fontSize: segs.length > 10 ? 10 : 12,
      color: INK,
      border: { type: 'solid', pt: 0.5, color: 'E3E7EF' },
      valign: 'middle',
      autoPage: false,
    });
    footer(slide, i + 2, d);
  }
  return pptx;
}

export async function exportPptx(d: ReportExportData): Promise<void> {
  const pptx = await buildPptx(d);
  await pptx.writeFile({ fileName: exportFileName(d, 'pptx') });
}
