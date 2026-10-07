'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { FileDown, Presentation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/input';
import { useForum } from '@/components/forum/forum-context';
import { formatDate } from '@/lib/dates';
import { buildAeChart } from '@/lib/report/ae-report';
import type { SortDir } from '@/lib/report/donut-layout';
import { setAeReportSort } from '@/server/actions/report';
import type { TaskDTO } from '@/lib/types';
import { ChartCard } from './report-view';

const TITLE = 'Отчёт для АЭ';

/** Вкладка «Отчёт для АЭ»: диаграмма фактических расходов по статьям из вкладки «Расходы». */
export function AeReportView() {
  const { forum, tasks, lookups, today } = useForum();
  const [reportDate, setDate] = React.useState(today);
  const [busy, setBusy] = React.useState<'pptx' | 'pdf' | null>(null);

  const blockOf = React.useCallback(
    (t: TaskDTO) => (t.blockId ? (lookups.block.get(t.blockId) ?? null) : null),
    [lookups],
  );
  const [sort, setSort] = React.useState<SortDir>(forum.aeReportSort);
  React.useEffect(() => setSort(forum.aeReportSort), [forum.aeReportSort]);
  const chart = React.useMemo(() => buildAeChart(tasks, blockOf, sort), [tasks, blockOf, sort]);
  const changeSort = async (next: SortDir) => {
    const prev = sort;
    setSort(next);
    const res = await setAeReportSort(forum.id, next);
    if (!res.ok) {
      setSort(prev);
      toast.error(res.error);
    } else toast.success('Сортировка сохранена', { id: 'saved' });
  };
  const charts = chart.items.length ? [chart] : [];

  const exportAs = async (kind: 'pptx' | 'pdf') => {
    setBusy(kind);
    try {
      const data = {
        forum,
        reportDate,
        charts,
        title: TITLE,
      };
      if (kind === 'pptx') {
        const { exportPptx } = await import('@/lib/report/export-pptx');
        await exportPptx(data);
      } else {
        const { exportPdf } = await import('@/lib/report/export-pdf');
        await exportPdf(data);
      }
      toast.success(kind === 'pptx' ? 'Презентация PPTX сформирована' : 'PDF сформирован');
    } catch (e) {
      console.error(e);
      toast.error('Не удалось сформировать файл');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4" data-testid="ae-report-view">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Дата составления отчёта" className="w-48">
          <DateInput
            value={reportDate}
            clearable={false}
            onChange={(d) => setDate(d ?? today)}
            ariaLabel="Дата составления отчёта"
          />
        </Field>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button onClick={() => exportAs('pptx')} disabled={!!busy || !charts.length}>
            <Presentation /> {busy === 'pptx' ? 'Формируем…' : 'Скачать PPTX'}
          </Button>
          <Button onClick={() => exportAs('pdf')} disabled={!!busy || !charts.length}>
            <FileDown /> {busy === 'pdf' ? 'Формируем…' : 'Скачать PDF'}
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-md bg-brand-dark px-5 py-4 text-white">
        <div className="text-xl font-semibold">
          {TITLE}: {forum.name}
        </div>
        <div className="mt-1 text-sm text-white/80">
          Фактические расходы по данным вкладки «Расходы» · Дата форума:{' '}
          {forum.endDate && forum.endDate !== forum.startDate
            ? `${formatDate(forum.startDate)} – ${formatDate(forum.endDate)}`
            : formatDate(forum.startDate)}{' '}
          · Дата составления отчёта: {formatDate(reportDate)}
        </div>
      </div>

      {/* Как в «Отчёте»: на широком экране диаграмма занимает половину строки */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {charts.map((c) => (
          <div key={c.id} className="flex [&>*]:flex-1">
            <ChartCard chart={c} count={charts.length} onSort={changeSort} />
          </div>
        ))}
        {charts.length === 0 && (
          <div className="rounded-md border border-dashed border-line p-10 text-center text-status-gray xl:col-span-2">
            Фактических расходов пока нет: внесите факт во вкладке «Расходы» → «Факт».
          </div>
        )}
      </div>
    </div>
  );
}
