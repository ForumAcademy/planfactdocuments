'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { FileDown, Presentation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/input';
import { TabGroup, TabLink } from '@/components/ui/tab-links';
import { useForum } from '@/components/forum/forum-context';
import { formatDate } from '@/lib/dates';
import { buildAeCharts } from '@/lib/report/ae-report';
import type { TaskDTO } from '@/lib/types';
import { ChartCard } from './report-view';

const TITLE = 'Отчёт для АЭ';

/** Вкладка «Отчёт для АЭ»: круговые диаграммы расходов форума (план или факт). */
export function AeReportView() {
  const { forum, tasks, lookups, today } = useForum();
  const sp = useSearchParams();
  const view = sp.get('view') === 'fact' ? 'fact' : 'plan';
  const [reportDate, setDate] = React.useState(today);
  const [busy, setBusy] = React.useState<'pptx' | 'pdf' | null>(null);

  const blockOf = React.useCallback(
    (t: TaskDTO) => (t.blockId ? (lookups.block.get(t.blockId) ?? null) : null),
    [lookups],
  );
  const cap = forum.expenseLimit ?? tasks.reduce((s, t) => s + t.cost, 0);
  const charts = React.useMemo(
    () => buildAeCharts(tasks, blockOf, view, cap),
    [tasks, blockOf, view, cap],
  );
  const base = `/forums/${forum.id}/report-ae`;

  const exportAs = async (kind: 'pptx' | 'pdf') => {
    setBusy(kind);
    try {
      const data = {
        forum,
        reportDate,
        charts,
        title: `${TITLE}: ${view === 'plan' ? 'план' : 'факт'} расходов`,
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
        <TabGroup
          className="inline-flex rounded-lg border border-line bg-surface p-0.5"
          role="tablist"
        >
          {(
            [
              ['plan', 'План', base],
              ['fact', 'Факт', `${base}?view=fact`],
            ] as const
          ).map(([key, label, href]) => (
            <TabLink
              key={key}
              href={href}
              role="tab"
              replace
              scroll={false}
              active={view === key}
              className="inline-flex items-center rounded-md px-5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              activeClassName="bg-white font-medium text-brand shadow-sm"
              inactiveClassName="text-ink/70 hover:text-ink"
              data-testid={`ae-tab-${key}`}
            >
              {label}
            </TabLink>
          ))}
        </TabGroup>
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
          {view === 'plan' ? 'Плановые расходы' : 'Фактические расходы'} по данным вкладки «Расходы»
          · Дата форума:{' '}
          {forum.endDate && forum.endDate !== forum.startDate
            ? `${formatDate(forum.startDate)} – ${formatDate(forum.endDate)}`
            : formatDate(forum.startDate)}{' '}
          · Дата составления отчёта: {formatDate(reportDate)}
        </div>
      </div>

      {/* По диаграмме в строке: в таблицах длинные названия задач */}
      <div className="mt-4 grid grid-cols-1 gap-4">
        {charts.map((c) => (
          <div key={c.id} className="flex [&>*]:flex-1">
            <ChartCard chart={c} count={charts.length} />
          </div>
        ))}
        {charts.length === 0 && (
          <div className="rounded-md border border-dashed border-line p-10 text-center text-status-gray">
            {view === 'plan'
              ? 'Плановых расходов пока нет: укажите стоимость задач во вкладке «Расходы».'
              : 'Фактических расходов пока нет: внесите факт во вкладке «Расходы» → «Факт».'}
          </div>
        )}
      </div>
    </div>
  );
}
