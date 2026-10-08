'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { FileDown, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { formatDate } from '@/lib/dates';
import { downloadBlob, safeFileName } from '@/lib/download';
import type { ReportSheetChart } from '@/lib/excel/report-excel';
import { PALETTES } from '@/lib/report/palette';
import type { ForumDTO } from '@/lib/types';
import { formatUnitValue } from '@/lib/report/units';
import { pluralRu } from '@/lib/utils';
import { importReport } from '@/server/actions/report';
import type { ChartDTO } from '@/server/report-queries';

/** Кнопки «Excel»: выгрузка отмеченных диаграмм; в «Отчёте» — ещё шаблон и загрузка. */
export function ReportExcelButtons({
  forum,
  reportDate,
  title = 'Отчёт',
  charts,
  exportCharts,
  importable,
  onImported,
}: {
  forum: ForumDTO;
  reportDate: string;
  title?: string;
  /** Активные диаграммы — для шаблона и загрузки */
  charts: ChartDTO[];
  /** Отмеченные для выгрузки */
  exportCharts: ChartDTO[];
  /** Шаблон и загрузка из Excel */
  importable: boolean;
  onImported: (charts: ChartDTO[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const sheetCharts = (list: ChartDTO[]) =>
    list.map((c) => ({
      title: c.title,
      palette: c.palette,
      unit: c.unit,
      items: c.items.map((i) => ({ name: i.name, amount: i.amount, note: i.note })),
    }));

  const exportXlsx = async (template = false) => {
    setBusy(true);
    try {
      const { buildReportWorkbook, buildReportTemplate } = await import('@/lib/excel/report-excel');
      const buf = template
        ? await buildReportTemplate(sheetCharts(charts), forum.name)
        : await buildReportWorkbook(sheetCharts(exportCharts), forum.name);
      downloadBlob(
        new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        template
          ? `${safeFileName(forum.name)} — шаблон отчёта.xlsx`
          : `${safeFileName(forum.name)} — ${title.toLowerCase()} ${formatDate(reportDate)}.xlsx`,
      );
    } catch (e) {
      console.error(e);
      toast.error('Не удалось сформировать файл');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {importable && (
        <>
          <Button
            variant="outline"
            onClick={() => exportXlsx(true)}
            disabled={busy}
            title="Таблица для заполнения: статьи отчёта с пустыми суммами и инструкцией"
            data-testid="report-template"
          >
            <FileDown /> Шаблон Excel
          </Button>
          <Button variant="outline" onClick={() => setOpen(true)} data-testid="report-import">
            <Upload /> Загрузить из Excel
          </Button>
        </>
      )}
      <Button
        variant="outline"
        onClick={() => exportXlsx(false)}
        disabled={busy || !exportCharts.length}
        data-testid="report-export-xlsx"
      >
        <FileSpreadsheet /> Выгрузить в Excel
      </Button>
      {open && (
        <ImportDialog
          forumId={forum.id}
          currentCount={charts.length}
          onTemplate={() => exportXlsx(true)}
          onClose={() => setOpen(false)}
          onImported={(c) => {
            onImported(c);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ImportDialog({
  forumId,
  currentCount,
  onTemplate,
  onClose,
  onImported,
}: {
  forumId: number;
  currentCount: number;
  onTemplate: () => void;
  onClose: () => void;
  onImported: (charts: ChartDTO[]) => void;
}) {
  const [parsed, setParsed] = React.useState<{
    charts: ReportSheetChart[];
    errors: string[];
  } | null>(null);
  const [fileName, setFileName] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    try {
      const { parseReportWorkbook } = await import('@/lib/excel/report-excel');
      setParsed(await parseReportWorkbook(await file.arrayBuffer()));
    } catch {
      setParsed({ charts: [], errors: ['Не удалось прочитать файл. Нужен файл Excel (.xlsx).'] });
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!parsed?.charts.length) return;
    setSaving(true);
    const res = await importReport(forumId, parsed.charts);
    setSaving(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(
      `Отчёт загружен: ${res.data.length} ${pluralRu(res.data.length, 'диаграмма', 'диаграммы', 'диаграмм')}`,
    );
    onImported(res.data);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Загрузка отчёта из Excel"
        description="Столбцы: Диаграмма · Цветовая гамма · Единица · Статья · Сумма · Доп. единица."
        wide
      >
        <p className="mb-3 text-sm text-ink/70">
          Нет файла?{' '}
          <button type="button" className="text-brand underline" onClick={onTemplate}>
            Скачайте шаблон
          </button>
          , впишите суммы и загрузите его сюда.
        </p>
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line p-4 hover:border-brand">
          <FileSpreadsheet className="size-6 text-brand" />
          <span className="text-sm font-medium">{fileName || 'Выберите файл .xlsx'}</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            data-testid="report-import-file"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        {loading && <Spinner className="mt-3" label="Читаем файл…" />}
        {parsed && (
          <div className="mt-4 space-y-3 text-sm">
            {parsed.errors.map((e) => (
              <p key={e} className="rounded bg-yellow-50 px-2 py-1 text-yellow-800">
                {e}
              </p>
            ))}
            {parsed.charts.length > 0 && (
              <>
                <p>
                  Активные диаграммы отчёта ({currentCount}) будут <b>заменены</b> диаграммами из
                  файла:
                </p>
                <div className="grid gap-2 sm:grid-cols-2" data-testid="report-import-preview">
                  {parsed.charts.map((c) => (
                    <div key={c.title} className="rounded-md border border-line p-3">
                      <div className="flex items-center gap-2 font-medium">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: PALETTES[c.palette].dark }}
                        />
                        {c.title}
                        <span className="ml-auto text-xs font-normal text-ink/60">
                          {PALETTES[c.palette].label.toLowerCase()} гамма
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-ink/70">
                        {c.items.length} {pluralRu(c.items.length, 'статья', 'статьи', 'статей')} ·
                        итого{' '}
                        {formatUnitValue(
                          c.items.reduce((s, i) => s + i.amount, 0),
                          c.unit,
                        )}{' '}
                        {c.unit}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            onClick={submit}
            disabled={!parsed?.charts.length || saving}
            data-testid="report-import-confirm"
          >
            {saving ? 'Загружаем…' : 'Заменить отчёт'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
