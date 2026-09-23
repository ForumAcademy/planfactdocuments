'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { formatDate } from '@/lib/dates';
import { downloadBlob, safeFileName } from '@/lib/download';
import type { ReportSheetChart } from '@/lib/excel/report-excel';
import { PALETTES } from '@/lib/report/palette';
import type { ForumDTO } from '@/lib/types';
import { formatAmount, pluralRu } from '@/lib/utils';
import { importReport } from '@/server/actions/report';
import type { ChartDTO } from '@/server/report-queries';

const PALETTE_DOT = { RED: '#D93838', GREEN: '#1E9E5A', BLUE: '#0A0A9F' } as const;

/** Кнопки «Excel»: выгрузка и загрузка диаграмм отчёта. */
export function ReportExcelButtons({
  forum,
  reportDate,
  charts,
  onImported,
}: {
  forum: ForumDTO;
  reportDate: string;
  charts: ChartDTO[];
  onImported: (charts: ChartDTO[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const exportXlsx = async () => {
    setBusy(true);
    try {
      const { buildReportWorkbook } = await import('@/lib/excel/report-excel');
      const buf = await buildReportWorkbook(
        charts.map((c) => ({
          title: c.title,
          palette: c.palette,
          unit: c.unit,
          items: c.items.map((i) => ({ name: i.name, amount: i.amount, note: i.note })),
        })),
        forum.name,
      );
      downloadBlob(
        new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `${safeFileName(forum.name)} — отчёт ${formatDate(reportDate)}.xlsx`,
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
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="report-import">
        <Upload /> Загрузить из Excel
      </Button>
      <Button
        variant="outline"
        onClick={exportXlsx}
        disabled={busy || !charts.length}
        data-testid="report-export-xlsx"
      >
        <FileSpreadsheet /> Выгрузить в Excel
      </Button>
      {open && (
        <ImportDialog
          forumId={forum.id}
          currentCount={charts.length}
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
  onClose,
  onImported,
}: {
  forumId: number;
  currentCount: number;
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
        description="Столбцы: Диаграмма · Цветовая гамма · Единица · Статья · Сумма · Доп. единица. Образец — кнопка «Выгрузить в Excel»."
        wide
      >
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
                  Текущие диаграммы отчёта ({currentCount}) будут <b>заменены</b> диаграммами из
                  файла:
                </p>
                <div className="grid gap-2 sm:grid-cols-2" data-testid="report-import-preview">
                  {parsed.charts.map((c) => (
                    <div key={c.title} className="rounded-md border border-line p-3">
                      <div className="flex items-center gap-2 font-medium">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: PALETTE_DOT[c.palette] }}
                        />
                        {c.title}
                        <span className="ml-auto text-xs font-normal text-ink/60">
                          {PALETTES[c.palette].label.toLowerCase()} гамма
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-ink/70">
                        {c.items.length} {pluralRu(c.items.length, 'статья', 'статьи', 'статей')} ·
                        итого {formatAmount(c.items.reduce((s, i) => s + i.amount, 0))} {c.unit}
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
