import { jsPDF } from 'jspdf';
import { formatDate } from '../dates';
import { formatAmount } from '../utils';
import {
  chartTotal,
  computeSegments,
  formatPct,
  radialLayout,
  sectorPoints,
} from './donut-layout';
import {
  BRAND,
  BRAND_DARK,
  GRAY,
  INK,
  exportFileName,
  forumDates,
  type ReportExportData,
} from './export-common';

// Слайд 16:9 в пунктах: 960 × 540
const W = 960;
const H = 540;

async function loadFont(url: string): Promise<string> {
  const buf = await (await fetch(url)).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

const hex = (c: string) => (c.startsWith('#') ? c : `#${c}`);

function header(doc: jsPDF, title: string, right: string) {
  doc.setFillColor(hex(BRAND));
  doc.rect(0, 0, W, 68, 'F');
  doc.setFont('DejaVu', 'bold');
  doc.setFontSize(24);
  doc.setTextColor('#FFFFFF');
  doc.text(title, 30, 43);
  doc.setFont('DejaVu', 'normal');
  doc.setFontSize(12);
  doc.setTextColor('#D6D6F5');
  doc.text(right, W - 30, 43, { align: 'right' });
}

function footer(doc: jsPDF, page: number, d: ReportExportData) {
  doc.setFont('DejaVu', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(hex(GRAY));
  doc.text(`${d.forum.name} · отчёт на ${formatDate(d.reportDate)}`, 30, H - 18);
  doc.text(String(page), W - 30, H - 18, { align: 'right' });
}

/** PDF в альбомной ориентации 16:9 с векторными диаграммами. */
export async function buildPdf(d: ReportExportData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [W, H], compress: true });
  const [regular, bold] = await Promise.all([
    loadFont('/fonts/DejaVuSans.ttf'),
    loadFont('/fonts/DejaVuSans-Bold.ttf'),
  ]);
  doc.addFileToVFS('DejaVuSans.ttf', regular);
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', bold);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  doc.setProperties({ title: `Отчёт — ${d.forum.name}`, creator: 'Статус форумы' });

  // Титульный лист
  doc.setFillColor(hex(BRAND));
  doc.rect(0, 0, W, 310, 'F');
  doc.setFillColor(hex(BRAND_DARK));
  doc.rect(0, 310, W, 9, 'F');
  doc.setFont('DejaVu', 'normal');
  doc.setFontSize(18);
  doc.setTextColor('#D6D6F5');
  doc.text('Отчёт', 58, 110);
  doc.setFont('DejaVu', 'bold');
  doc.setFontSize(40);
  doc.setTextColor('#FFFFFF');
  doc.text(doc.splitTextToSize(d.forum.name, W - 120) as string[], 58, 165);
  doc.setFontSize(15);
  doc.setFont('DejaVu', 'normal');
  doc.setTextColor(hex(GRAY));
  doc.text('Дата форума:', 58, 370);
  doc.text('Дата составления отчёта:', 58, 400);
  doc.setFont('DejaVu', 'bold');
  doc.setTextColor(hex(INK));
  doc.text(forumDates(d.forum), 290, 370);
  doc.text(formatDate(d.reportDate), 290, 400);
  footer(doc, 1, d);

  d.charts.forEach((c, i) => {
    doc.addPage([W, H], 'landscape');
    header(doc, c.title, d.forum.name);
    const segs = computeSegments(c.items, c.palette);
    const total = chartTotal(c.items);
    const cx = 290;
    const cy = 300;
    const outerR = 170;

    if (segs.length) {
      const L = radialLayout(segs, cx, cy, outerR, 11);
      // Тонкие фоновые окружности
      doc.setDrawColor('#E3E7EF');
      doc.setLineWidth(0.6);
      for (const r of L.rings) doc.circle(cx, cy, r, 'S');
      // Сектора: ширина — доля, длина убывает по спирали
      doc.setDrawColor('#FFFFFF');
      doc.setLineWidth(1.5);
      for (const s of L.sectors) {
        doc.setFillColor(s.segment.color);
        const pts = sectorPoints(cx, cy, s.r, s.a0, s.a1);
        doc.moveTo(pts[0].x, pts[0].y);
        for (const p of pts.slice(1)) doc.lineTo(p.x, p.y);
        doc.close();
        doc.fillStroke();
      }
      // Белый круг с итогом в центре
      doc.setFillColor('#EDEFF3');
      doc.circle(cx, cy, L.hole + 1.5, 'F');
      doc.setFillColor('#FFFFFF');
      doc.circle(cx, cy, L.hole, 'F');
      doc.setFont('DejaVu', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(hex(INK));
      doc.text(formatAmount(total), cx, cy + 3, { align: 'center' });
      doc.setFont('DejaVu', 'normal');
      doc.setFontSize(10);
      doc.setTextColor('#444444');
      doc.text(c.unit, cx, cy + 19, { align: 'center' });

      // Доли внутри секторов (названия и суммы — в таблице справа)
      doc.setFont('DejaVu', 'bold');
      doc.setFontSize(11);
      for (const s of L.sectors) {
        if (!s.label) continue;
        doc.setTextColor(s.label.dark ? '#FFFFFF' : hex(INK));
        doc.text(s.label.text, s.label.x, s.label.y + 3.8, { align: 'center' });
      }
    } else {
      doc.setFontSize(16);
      doc.setTextColor(hex(GRAY));
      doc.text('Нет данных', cx, cy, { align: 'center' });
    }

    // Легенда-таблица справа
    const x0 = 610;
    let y = 100;
    const rowH = segs.length > 12 ? 20 : 26;
    doc.setFillColor('#F4F6FA');
    doc.rect(x0, y, 320, rowH, 'F');
    doc.setFont('DejaVu', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(hex(INK));
    doc.text('Название', x0 + 22, y + rowH / 2 + 3.5);
    doc.text(c.unit, x0 + 262, y + rowH / 2 + 3.5, { align: 'right' });
    doc.text('Доля', x0 + 314, y + rowH / 2 + 3.5, { align: 'right' });
    y += rowH;
    doc.setFont('DejaVu', 'normal');
    doc.setDrawColor('#E3E7EF');
    doc.setLineWidth(0.5);
    for (const s of segs) {
      doc.setFillColor(s.color);
      doc.rect(x0 + 6, y + rowH / 2 - 5, 10, 10, 'F');
      doc.setTextColor(hex(INK));
      const name = doc.splitTextToSize(s.name, 150) as string[];
      doc.text(name[0] + (name.length > 1 ? '…' : ''), x0 + 22, y + rowH / 2 + 3.5);
      doc.text(
        formatAmount(s.amount) + (s.note ? ` (${s.note})` : ''),
        x0 + 262,
        y + rowH / 2 + 3.5,
        {
          align: 'right',
        },
      );
      doc.setTextColor('#555555');
      doc.text(formatPct(s.pct), x0 + 314, y + rowH / 2 + 3.5, { align: 'right' });
      doc.line(x0, y + rowH, x0 + 320, y + rowH);
      y += rowH;
    }
    doc.setFont('DejaVu', 'bold');
    doc.setTextColor(hex(INK));
    doc.text('Итого', x0 + 22, y + rowH / 2 + 3.5);
    doc.text(formatAmount(total), x0 + 262, y + rowH / 2 + 3.5, { align: 'right' });
    doc.text(total > 0 ? '100 %' : '—', x0 + 314, y + rowH / 2 + 3.5, { align: 'right' });
    footer(doc, i + 2, d);
  });
  return doc;
}

export async function exportPdf(d: ReportExportData): Promise<void> {
  const doc = await buildPdf(d);
  doc.save(exportFileName(d, 'pdf'));
}
