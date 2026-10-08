'use client';

import * as React from 'react';
import { markCacheStale } from '@/lib/stale-cache';
import { toast } from 'sonner';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  ArrowUpNarrowWide,
  FileDown,
  GripVertical,
  Keyboard,
  Pencil,
  Plus,
  Presentation,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatDate, todayMsk } from '@/lib/dates';
import { chartTotal, computeSegments, formatPct, type SortDir } from '@/lib/report/donut-layout';
import { AUTO_SOURCES, autoSource, unitScale, type AutoSource } from '@/lib/report/auto-charts';
import { PALETTE_KEYS, PALETTES, type PaletteKey } from '@/lib/report/palette';
import { formatUnitValue, isMoneyUnit, isUsdUnit, UNIT_PRESETS } from '@/lib/report/units';
import type { ForumDTO } from '@/lib/types';
import { cn, parseAmount } from '@/lib/utils';
import {
  deleteChart,
  refreshAutoChart,
  reorderCharts,
  saveChart,
  setChartArchived,
  setChartSort,
  setReportDate,
  updateChart,
} from '@/server/actions/report';
import type { ChartDTO, ReportKind } from '@/server/report-queries';
import { DonutChart } from './donut-chart';
import { ReportExcelButtons } from './report-excel';
import { useAutoCharts } from './use-auto-charts';
import { useForum } from '@/components/forum/forum-context';

const TITLES: Record<ReportKind, string> = { main: 'Отчёт', ae: 'Отчёт для АЭ' };

type Section = 'active' | 'archive';

type Result = { ok: true; data: ChartDTO[] } | { ok: false; error: string };

/** Время последнего «Автообновления»: «08.10.2026 10:15» по Москве */
function refreshedLabel(iso: string): string {
  return new Date(iso)
    .toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', '');
}

/**
 * «Отчёт» и «Отчёт для АЭ»: круговые диаграммы в подразделах «Активные» и «Архив».
 * Каждая диаграмма правится, архивируется и удаляется сама по себе. Автоматические берут строки
 * из «Расходов» и «Доходов»; после ручных правок «Автообновление» возвращает исходные данные.
 * Для выгрузки в PPTX, PDF и Excel диаграммы отмечаются галочкой.
 */
export function ReportView({
  forum,
  kind = 'main',
  charts: initial,
}: {
  forum: ForumDTO;
  kind?: ReportKind;
  /** Диаграммы обеих вкладок форума — сервер возвращает их вместе */
  charts: ChartDTO[];
}) {
  const [all, setAll] = React.useState(initial);
  const charts = React.useMemo(() => all.filter((c) => c.report === kind), [all, kind]);
  const setCharts = (next: ChartDTO[]) =>
    setAll((list) => [...list.filter((c) => c.report !== kind), ...next]);
  const { shown: shownAll, rows } = useAutoCharts(charts);
  const title = TITLES[kind];
  const confirm = useConfirm();
  const [section, setSection] = React.useState<Section>('active');
  const archive = section === 'archive';
  const active = React.useMemo(() => charts.filter((c) => !c.archived), [charts]);
  const archivedCount = charts.length - active.length;
  const shown = React.useMemo(
    () => shownAll.filter((c) => c.archived === archive),
    [shownAll, archive],
  );
  // Галочки «В выгрузку»: храним снятые, чтобы новые диаграммы попадали в выгрузку сами
  const [excluded, setExcluded] = React.useState<Set<number>>(() => new Set());
  const selected = shown.filter((c) => !excluded.has(c.id));
  const toggleSelected = (id: number, on: boolean) =>
    setExcluded((s) => {
      const n = new Set(s);
      if (on) n.delete(id);
      else n.add(id);
      return n;
    });
  const [reportDate, setDate] = React.useState(forum.reportDate ?? todayMsk());
  const [editId, setEditId] = React.useState<number | null>(null);
  const editing = shownAll.find((c) => c.id === editId) ?? null;
  const [busy, setBusy] = React.useState<'pptx' | 'pdf' | null>(null);
  const [refreshing, setRefreshing] = React.useState<number | null>(null);

  React.useEffect(() => setAll(initial), [initial]);

  const apply = (res: Result, msg: string | null = 'Сохранено') => {
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    markCacheStale();
    setAll(res.data);
    if (msg) toast.success(msg, { id: 'saved' });
    return true;
  };

  // Автоматическая диаграмма без снимка (новая или из старых данных) один раз заполняется сама
  const filled = React.useRef(new Set<number>());
  React.useEffect(() => {
    const todo = charts.filter((c) => c.source && !c.refreshedAt && !filled.current.has(c.id));
    if (!todo.length) return;
    void (async () => {
      for (const c of todo) {
        filled.current.add(c.id);
        const res = await refreshAutoChart(forum.id, c.id, rows[c.source!]);
        if (res.ok) setAll(res.data);
      }
    })();
  }, [charts, rows, forum.id]);

  const addChart = async (source: AutoSource | null) => {
    const a = source ? autoSource(source) : null;
    const before = new Set(all.map((c) => c.id));
    const res = await saveChart(forum.id, {
      title: a?.title ?? 'Новая диаграмма',
      palette: a?.palette ?? 'BLUE',
      unit: 'млн руб.',
      report: kind,
      source,
      rows: source ? rows[source] : undefined,
    });
    if (!apply(res, 'Диаграмма добавлена')) return;
    setSection('active');
    // Пустую сразу открываем на правку — в ней нечего показывать
    const added = res.ok ? res.data.find((c) => !before.has(c.id)) : undefined;
    if (added && !source) setEditId(added.id);
  };

  const refreshChart = async (c: ChartDTO) => {
    if (!c.source) return;
    if (
      c.edited &&
      !(await confirm({
        title: `Вернуть исходные данные в «${c.title}»?`,
        description: 'Ручные правки строк заменятся текущими данными «Расходов» и «Доходов».',
        confirmText: 'Обновить',
      }))
    )
      return;
    setRefreshing(c.id);
    apply(
      await refreshAutoChart(forum.id, c.id, rows[c.source]),
      'Данные обновлены из «Расходов» и «Доходов»',
    );
    setRefreshing(null);
  };

  const archiveChart = async (c: ChartDTO, to: boolean) =>
    apply(
      await setChartArchived(forum.id, c.id, to),
      to ? 'Диаграмма перенесена в архив' : 'Диаграмма возвращена в активные',
    );

  const removeChart = async (c: ChartDTO) => {
    const ok = await confirm({
      title: `Удалить диаграмму «${c.title}»?`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (ok) apply(await deleteChart(forum.id, c.id), 'Диаграмма удалена');
  };

  // Перестановка блоков прямо на странице: перетаскивание за ручку
  const [dragId, setDragId] = React.useState<number | null>(null);
  const [overId, setOverId] = React.useState<number | null>(null);
  const moveChart = async (from: number, to: number) => {
    if (from === to || to < 0 || to >= active.length) return;
    const prev = charts;
    const next = [...active];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setCharts([...next, ...charts.filter((c) => c.archived)]);
    if (
      !apply(
        await reorderCharts(
          forum.id,
          next.map((c) => c.id),
        ),
        'Порядок сохранён',
      )
    ) {
      setCharts(prev);
    }
  };

  const onDate = async (d: string | null) => {
    const v = d ?? todayMsk();
    setDate(v);
    const res = await setReportDate(forum.id, v);
    if (!res.ok) toast.error(res.error);
    else toast.success('Дата отчёта сохранена', { id: 'saved' });
  };

  const exportAs = async (kind: 'pptx' | 'pdf') => {
    setBusy(kind);
    try {
      const data = { forum, reportDate, charts: selected, title };
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
    <div className="mx-auto max-w-[1600px] px-4 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Дата составления отчёта" className="w-48">
          <DateInput
            value={reportDate}
            clearable={false}
            onChange={onDate}
            ariaLabel="Дата составления отчёта"
          />
        </Field>
        <div className="ml-auto flex flex-wrap gap-2">
          <AddChartMenu onAdd={addChart} />
          <ReportExcelButtons
            forum={forum}
            reportDate={reportDate}
            title={title}
            charts={shownAll.filter((c) => !c.archived)}
            exportCharts={selected}
            importable={kind === 'main'}
            onImported={(c) => {
              markCacheStale();
              setAll(c);
            }}
          />
          <Button
            onClick={() => exportAs('pptx')}
            disabled={!!busy || !selected.length}
            data-testid="export-pptx"
          >
            <Presentation /> {busy === 'pptx' ? 'Формируем…' : 'Скачать PPTX'}
          </Button>
          <Button
            onClick={() => exportAs('pdf')}
            disabled={!!busy || !selected.length}
            data-testid="export-pdf"
          >
            <FileDown /> {busy === 'pdf' ? 'Формируем…' : 'Скачать PDF'}
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-md bg-brand-dark px-5 py-4 text-white">
        <div className="text-xl font-semibold">
          {title}: {forum.name}
        </div>
        <div className="mt-1 text-sm text-white/80">
          Дата форума:{' '}
          {forum.endDate && forum.endDate !== forum.startDate
            ? `${formatDate(forum.startDate)} – ${formatDate(forum.endDate)}`
            : formatDate(forum.startDate)}{' '}
          · Дата составления отчёта: {formatDate(reportDate)}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 print:hidden">
        <div
          className="inline-flex rounded-md border border-line bg-surface p-0.5"
          role="tablist"
          aria-label="Подразделы отчёта"
        >
          {(
            [
              ['active', 'Активные', active.length],
              ['archive', 'Архив', archivedCount],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={section === key}
              onClick={() => setSection(key)}
              className={cn(
                'rounded px-3 py-1.5 text-sm',
                section === key
                  ? 'bg-white font-medium text-brand shadow-sm'
                  : 'text-ink/60 hover:text-ink',
              )}
              data-testid={`report-section-${key}`}
            >
              {label} <span className="tabular-nums text-ink/50">{n}</span>
            </button>
          ))}
        </div>
        {shown.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm text-ink/70">
            <span data-testid="export-selected">
              В выгрузку: {selected.length} из {shown.length}
            </span>
            <button
              type="button"
              className="text-brand hover:underline"
              onClick={() => setExcluded(new Set())}
            >
              Выбрать все
            </button>
            <button
              type="button"
              className="text-brand hover:underline"
              onClick={() => setExcluded(new Set(charts.map((c) => c.id)))}
            >
              Снять все
            </button>
          </div>
        )}
      </div>

      {/* На широком экране — по две диаграммы в строке */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {shown.map((c, i) => (
          <div
            key={c.id}
            className={cn(
              'flex rounded-md transition-shadow [&>*]:flex-1',
              dragId === c.id && 'opacity-50',
              overId === c.id && dragId !== c.id && 'ring-2 ring-brand ring-offset-2',
            )}
            onDragOver={(e) => {
              if (dragId === null) return;
              e.preventDefault();
              setOverId(c.id);
            }}
            onDragLeave={() => setOverId((o) => (o === c.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const from = active.findIndex((x) => x.id === dragId);
              setDragId(null);
              setOverId(null);
              if (from >= 0) void moveChart(from, i);
            }}
          >
            <ChartCard
              chart={c}
              count={archive ? 1 : active.length}
              selected={!excluded.has(c.id)}
              onSelect={(on) => toggleSelected(c.id, on)}
              refreshing={refreshing === c.id}
              onRefresh={() => refreshChart(c)}
              onEdit={() => setEditId(c.id)}
              onArchive={() => archiveChart(c, !c.archived)}
              onDelete={() => removeChart(c)}
              onSort={async (sort) => {
                setCharts(charts.map((x) => (x.id === c.id ? { ...x, sort } : x)));
                apply(await setChartSort(forum.id, c.id, sort), 'Сортировка сохранена');
              }}
              onDragStart={() => setDragId(c.id)}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
            />
          </div>
        ))}
        {shown.length === 0 && (
          <div className="rounded-md border border-dashed border-line p-10 text-center text-status-gray xl:col-span-2">
            {archive
              ? 'В архиве нет диаграмм. Перенести диаграмму в архив можно кнопкой с коробкой у её названия.'
              : 'В отчёте нет диаграмм. Нажмите «Добавить диаграмму».'}
          </div>
        )}
      </div>

      {editing && (
        <ChartEditDialog
          key={editing.id}
          chart={editing}
          onClose={() => setEditId(null)}
          onSave={async (patch) => {
            const ok = apply(await updateChart(forum.id, editing.id, patch), 'Диаграмма сохранена');
            if (ok) setEditId(null);
          }}
        />
      )}
    </div>
  );
}

/** Кнопка «Добавить диаграмму»: пустая (ручной ввод) или автоматическая из вкладок */
function AddChartMenu({ onAdd }: { onAdd: (source: AutoSource | null) => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  // Меню закрывается кликом мимо него
  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const add = (source: AutoSource | null) => {
    setOpen(false);
    void onAdd(source);
  };
  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" onClick={() => setOpen((o) => !o)} data-testid="chart-add">
        <Plus /> Добавить диаграмму
      </Button>
      {open && (
        <div
          className="absolute left-0 z-20 mt-1 w-80 rounded-md border border-line bg-white p-1 shadow-lg sm:left-auto sm:right-0"
          data-testid="chart-add-menu"
        >
          <button
            type="button"
            className="w-full rounded px-3 py-2 text-left text-sm hover:bg-surface"
            onClick={() => add(null)}
          >
            <div className="font-medium">Пустая диаграмма</div>
            <div className="text-xs text-ink/60">
              Ручной ввод: строки, суммы или количество вносятся вручную
            </div>
          </button>
          <div className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-ink/50">
            Авто: из вкладок «Расходы» и «Доходы»
          </div>
          {AUTO_SOURCES.map((a) => (
            <button
              key={a.key}
              type="button"
              className="flex w-full items-start gap-2 rounded px-3 py-2 text-left text-sm hover:bg-surface"
              onClick={() => add(a.key)}
            >
              <span
                className="mt-1 size-2.5 shrink-0 rounded-sm"
                style={{ background: PALETTES[a.palette].dark }}
              />
              <span>
                <span className="block font-medium">{a.title}</span>
                <span className="block text-xs text-ink/60">{a.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChartCard({
  chart,
  count,
  selected,
  onSelect,
  refreshing,
  onRefresh,
  onEdit,
  onArchive,
  onDelete,
  onDragStart,
  onDragEnd,
  onSort,
}: {
  chart: ChartDTO;
  count: number;
  /** Галочка «В выгрузку» */
  selected: boolean;
  onSelect: (on: boolean) => void;
  refreshing: boolean;
  /** «Автообновление» — только у автоматических */
  onRefresh: () => void;
  onEdit: () => void;
  /** В архив или обратно в активные */
  onArchive: () => void;
  onDelete: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Смена порядка статей; без него переключатель не показывается */
  onSort?: (sort: SortDir) => void;
}) {
  const sort = chart.sort ?? 'desc';
  const total = chartTotal(chart.items);
  const segments = computeSegments(chart.items, chart.palette, sort);
  const hasNotes = segments.some((s) => s.note);
  const fmt = (n: number) => formatUnitValue(n, chart.unit);
  return (
    <Card className={cn('flex flex-col p-4', !selected && 'opacity-70')} data-testid="report-chart">
      {/* Кнопки — в верхней строке у всех диаграмм, чтобы стояли на одной высоте; название — под ними */}
      <div className="flex items-center gap-2">
        {count > 1 && onDragStart && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              // Перетаскиваем весь блок, а не только ручку
              const card = e.currentTarget.closest('[data-testid=report-chart]');
              if (card) e.dataTransfer.setDragImage(card, 24, 24);
              onDragStart?.();
            }}
            onDragEnd={onDragEnd}
            className="-ml-1 cursor-grab rounded p-1 text-ink/40 hover:bg-surface hover:text-ink active:cursor-grabbing"
            title="Перетащите, чтобы поменять место блока"
            aria-hidden
            data-testid="chart-drag"
          >
            <GripVertical className="size-4" />
          </span>
        )}
        <input
          type="checkbox"
          className="size-4 shrink-0 cursor-pointer accent-brand print:hidden"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          title="В выгрузку PPTX, PDF и Excel"
          aria-label="В выгрузку"
          data-testid="chart-select"
        />
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1 print:hidden">
          {onSort && <SortToggle value={sort} onChange={onSort} />}
          {chart.source && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRefresh}
              disabled={refreshing}
              title="Взять текущие данные из «Расходов» и «Доходов» вместо ручных правок"
              data-testid="chart-refresh"
            >
              <RefreshCw className={cn(refreshing && 'animate-spin')} /> Автообновление
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={onEdit}
            title="Редактировать диаграмму"
            data-testid="chart-edit"
          >
            <Pencil />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onArchive}
            title={chart.archived ? 'Вернуть в активные' : 'В архив'}
            data-testid="chart-archive"
          >
            {chart.archived ? <ArchiveRestore /> : <Archive />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-status-red"
            onClick={onDelete}
            title="Удалить диаграмму"
            data-testid="chart-delete"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{chart.title}</h2>
        {chart.source ? <AutoBadge source={chart.source} /> : <ManualBadge />}
      </div>
      {/* Строка даты есть у всех диаграмм (у ручных — пустая), чтобы таблицы начинались на одной высоте */}
      <div className="mt-0.5 min-h-4 text-xs text-ink/50">
        {chart.source && chart.refreshedAt && (
          <>
            Данные на {refreshedLabel(chart.refreshedAt)}
            {chart.edited && <span className="text-yellow-800"> · изменены вручную</span>}
          </>
        )}
      </div>
      {/* Диаграмма — по центру блока по вертикали, таблица — сверху */}
      <div className="mt-2 grid flex-1 grid-cols-1 items-start gap-6 md:grid-cols-[312px_minmax(0,1fr)] md:gap-8">
        <div className="self-center py-2">
          <DonutChart
            items={chart.items}
            palette={chart.palette}
            unit={chart.unit}
            sort={sort}
            size={280}
          />
        </div>
        {/* Таблица справа — она же легенда */}
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs text-ink/70">
            <tr>
              <th className="min-w-[140px] px-2 py-1.5">Статья</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right">{chart.unit}</th>
              {hasNotes && <th className="px-2 py-1.5 text-right">Доп.</th>}
              <th className="w-16 px-2 py-1.5 text-right">Доля</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.index} className="border-t border-line align-top">
                <td className="px-2 py-1.5">
                  <span className="flex items-start gap-2">
                    <span
                      className="mt-1 size-2.5 shrink-0 rounded-sm"
                      style={{ background: s.color }}
                    />
                    {s.name}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                  {fmt(s.amount)}
                </td>
                {hasNotes && (
                  <td className="max-w-[180px] px-2 py-1.5 text-right text-ink/70">
                    {s.note ?? ''}
                  </td>
                )}
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-ink/70">
                  {formatPct(s.pct)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink/20 font-semibold">
              <td className="px-2 py-1.5">Итого</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                {fmt(total)}
              </td>
              {hasNotes && <td />}
              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                {total > 0 ? '100 %' : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Метка автоматической диаграммы: откуда берутся строки */
function AutoBadge({ source }: { source: AutoSource }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded bg-brand-light px-1.5 py-0.5 text-[11px] text-brand print:hidden"
      title={`${autoSource(source).hint}. Исходные данные возвращает кнопка «Автообновление».`}
      data-testid="chart-auto"
    >
      <RefreshCw className="size-3" /> авто
    </span>
  );
}

/** Метка диаграммы, строки которой вносятся вручную */
function ManualBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[11px] text-ink/60 print:hidden"
      title="Строки вносятся вручную кнопкой с карандашом"
      data-testid="chart-manual"
    >
      <Keyboard className="size-3" /> Ручной ввод
    </span>
  );
}

/** Переключатель порядка статей: по убыванию / по возрастанию суммы */
function SortToggle({ value, onChange }: { value: SortDir; onChange: (v: SortDir) => void }) {
  const opts = [
    { key: 'desc', label: 'По убыванию', Icon: ArrowDownWideNarrow },
    { key: 'asc', label: 'По возрастанию', Icon: ArrowUpNarrowWide },
  ] as const;
  return (
    <div
      className="inline-flex shrink-0 rounded-md border border-line bg-surface p-0.5 print:hidden"
      role="group"
      aria-label="Сортировка статей"
      data-testid="chart-sort"
    >
      {opts.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => key !== value && onChange(key)}
          aria-pressed={value === key}
          title={`Сортировать статьи ${label.toLowerCase()}`}
          className={cn(
            'inline-flex items-center gap-1 rounded px-2 py-1 text-xs',
            value === key
              ? 'bg-white font-medium text-brand shadow-sm'
              : 'text-ink/60 hover:text-ink',
          )}
        >
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

interface DraftItem {
  key: string;
  name: string;
  amount: string;
  note: string;
}

let draftSeq = 0;

const CUSTOM_UNIT = '__custom';

/** Число для поля ввода: без пробелов, с запятой, без лишних нулей */
function draftAmount(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** Правка одной диаграммы: название, цвет, единица измерения и строки */
function ChartEditDialog({
  chart,
  onClose,
  onSave,
}: {
  chart: ChartDTO;
  onClose: () => void;
  onSave: (patch: {
    title: string;
    palette: PaletteKey;
    unit: string;
    items: { name: string; amount: number; note: string | null }[];
  }) => Promise<void>;
}) {
  const { forum } = useForum();
  const isPreset = UNIT_PRESETS.some((p) => p.unit === chart.unit);
  const [title, setTitle] = React.useState(chart.title);
  const [palette, setPalette] = React.useState<PaletteKey>(chart.palette);
  const [unitChoice, setUnitChoice] = React.useState(isPreset ? chart.unit : CUSTOM_UNIT);
  const [customUnit, setCustomUnit] = React.useState(isPreset ? '' : chart.unit);
  const unit = unitChoice === CUSTOM_UNIT ? customUnit.trim() : unitChoice;
  const [items, setItems] = React.useState<DraftItem[]>(() =>
    chart.items.map((i) => ({
      key: String(i.id),
      name: i.name,
      amount: draftAmount(i.amount),
      note: i.note ?? '',
    })),
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const change = (list: DraftItem[]) => {
    setItems(list);
    setError('');
  };
  const update = (k: number, patch: Partial<DraftItem>) =>
    change(items.map((x, i) => (i === k ? { ...x, ...patch } : x)));
  // У авто-диаграммы суммы денежные: при смене руб./$ и млн/тыс. значения пересчитываются
  const changeUnit = (next: string) => {
    const from = unit;
    setUnitChoice(next);
    if (!chart.source || next === CUSTOM_UNIT || !isMoneyUnit(from) || !isMoneyUnit(next)) return;
    if (isUsdUnit(next) && !forum.usdRate) return;
    const k = unitScale(from, forum.usdRate) / unitScale(next, forum.usdRate);
    if (k === 1) return;
    change(
      items.map((x) => {
        const a = parseAmount(x.amount);
        if (a === null) return x;
        const v = a * k;
        const digits = Math.abs(v) >= 1 || v === 0 ? 100 : 10_000;
        return { ...x, amount: String(Math.round(v * digits) / digits).replace('.', ',') };
      }),
    );
  };
  const swap = (a: number, b: number) => {
    const l = [...items];
    [l[a], l[b]] = [l[b], l[a]];
    change(l);
  };

  const save = async () => {
    if (!title.trim()) return setError('Укажите название диаграммы');
    if (!unit) return setError('Укажите единицу измерения');
    if (chart.source && isUsdUnit(unit) && !forum.usdRate)
      return setError('Для диаграммы в $ задайте курс доллара в шапке форума');
    const parsed: { name: string; amount: number; note: string | null }[] = [];
    for (const [k, i] of items.entries()) {
      if (!i.name.trim() && !i.amount.trim() && !i.note.trim()) continue;
      const a = parseAmount(i.amount || '0');
      if (!i.name.trim()) return setError(`Строка ${k + 1}: укажите название статьи`);
      if (a === null || a < 0)
        return setError(`Строка ${k + 1}: значение должно быть числом, например 6,21 или 30`);
      parsed.push({ name: i.name.trim(), amount: a, note: i.note.trim() || null });
    }
    setSaving(true);
    await onSave({ title: title.trim(), palette, unit, items: parsed });
    setSaving(false);
  };

  const total = items.reduce((s, i) => s + (parseAmount(i.amount) ?? 0), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Редактирование диаграммы"
        description={
          chart.source
            ? `Авто: ${autoSource(chart.source).hint}. Строки можно поправить вручную, исходные данные вернёт кнопка «Автообновление».`
            : 'Ручной ввод: строки и значения вносятся вручную.'
        }
        wide
      >
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Название диаграммы" className="min-w-[220px] flex-1">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="chart-edit-title"
            />
          </Field>
          <Field label="Цветовая гамма" className="w-40">
            <Select value={palette} onChange={(e) => setPalette(e.target.value as PaletteKey)}>
              {PALETTE_KEYS.map((p) => (
                <option key={p} value={p}>
                  {PALETTES[p].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Единица измерения" className="w-40">
            <Select
              value={unitChoice}
              onChange={(e) => changeUnit(e.target.value)}
              data-testid="chart-edit-unit"
            >
              {UNIT_PRESETS.map((p) => (
                <option key={p.unit} value={p.unit}>
                  {p.unit}
                </option>
              ))}
              <option value={CUSTOM_UNIT}>Другая…</option>
            </Select>
          </Field>
          {unitChoice === CUSTOM_UNIT && (
            <Field label="Своя единица" className="w-36">
              <Input
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                placeholder="напр. билетов"
                data-testid="chart-edit-unit-custom"
              />
            </Field>
          )}
        </div>
        <p className="mt-1 text-xs text-ink/60">
          Формат чисел — по единице: {formatUnitValue(1234.5, unit || 'шт.')} {unit || 'шт.'}
          {chart.source &&
            isUsdUnit(unit) &&
            (forum.usdRate
              ? `. Суммы в $ — из рублей по курсу 1 $ = ${forum.usdRate.toLocaleString('ru-RU')} р.`
              : '. Курс доллара не задан: задайте его в шапке форума')}
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-ink/60">
              <tr>
                <th className="w-8" />
                <th className="px-1 py-1">Статья</th>
                <th className="w-32 px-1 py-1">Значение ({unit || '—'})</th>
                <th className="w-36 px-1 py-1">Доп. единица</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, k) => (
                <tr key={it.key}>
                  <td className="text-xs text-ink/50">{k + 1}</td>
                  <td className="px-1 py-0.5">
                    <Input
                      value={it.name}
                      onChange={(e) => update(k, { name: e.target.value })}
                      aria-label="Статья"
                      className="h-8"
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input
                      value={it.amount}
                      inputMode="decimal"
                      onChange={(e) => update(k, { amount: e.target.value })}
                      aria-label="Значение"
                      placeholder="0"
                      className="h-8 text-right tabular-nums"
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <Input
                      value={it.note}
                      onChange={(e) => update(k, { note: e.target.value })}
                      aria-label="Доп. единица"
                      placeholder="напр. 6 шт."
                      className="h-8"
                    />
                  </td>
                  <td className="whitespace-nowrap px-1">
                    <Button
                      size="iconSm"
                      variant="ghost"
                      disabled={k === 0}
                      onClick={() => swap(k, k - 1)}
                      title="Выше"
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="iconSm"
                      variant="ghost"
                      disabled={k === items.length - 1}
                      onClick={() => swap(k, k + 1)}
                      title="Ниже"
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      size="iconSm"
                      variant="ghost"
                      onClick={() => change(items.filter((_, i) => i !== k))}
                      title="Удалить строку"
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                change([...items, { key: `new-${++draftSeq}`, name: '', amount: '', note: '' }])
              }
              data-testid="chart-edit-add-row"
            >
              <Plus /> Добавить строку
            </Button>
            <span className="ml-auto text-sm font-semibold tabular-nums">
              Итого: {formatUnitValue(total, unit || 'шт.')} {unit}
            </span>
          </div>
          {error && <p className="mt-2 text-sm text-status-red">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={save} disabled={saving} data-testid="chart-edit-save">
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
