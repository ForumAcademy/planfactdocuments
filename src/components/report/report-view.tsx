'use client';

import * as React from 'react';
import { markCacheStale } from '@/lib/stale-cache';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  ArrowUpNarrowWide,
  Copy,
  FileDown,
  GripVertical,
  Pencil,
  Plus,
  Presentation,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatDate, todayMsk } from '@/lib/dates';
import { chartTotal, computeSegments, formatPct, type SortDir } from '@/lib/report/donut-layout';
import { AUTO_SOURCES, autoSource, type AutoSource } from '@/lib/report/auto-charts';
import { PALETTES, type PaletteKey } from '@/lib/report/palette';
import type { ForumDTO } from '@/lib/types';
import { cn, formatAmount, parseAmount } from '@/lib/utils';
import {
  copyReportFrom,
  deleteChart,
  reorderCharts,
  saveChart,
  saveChartItems,
  setChartSort,
  setReportDate,
} from '@/server/actions/report';
import type { ChartDTO, ReportKind } from '@/server/report-queries';
import { DonutChart } from './donut-chart';
import { ReportExcelButtons } from './report-excel';
import { useAutoCharts } from './use-auto-charts';

const TITLES: Record<ReportKind, string> = { main: 'Отчёт', ae: 'Отчёт для АЭ' };

/**
 * «Отчёт» и «Отчёт для АЭ»: круговые диаграммы. Базовые строятся сами из «Расходов» и «Доходов»,
 * их можно переименовать, перекрасить, удалить или перевести в ручные; можно добавлять свои.
 */
export function ReportView({
  forum,
  kind = 'main',
  charts: initial,
  forumOptions,
}: {
  forum: ForumDTO;
  kind?: ReportKind;
  /** Диаграммы обеих вкладок форума — сервер возвращает их вместе */
  charts: ChartDTO[];
  forumOptions: { id: number; name: string }[];
}) {
  const [all, setAll] = React.useState(initial);
  const charts = React.useMemo(() => all.filter((c) => c.report === kind), [all, kind]);
  const setCharts = (next: ChartDTO[] | ((list: ChartDTO[]) => ChartDTO[])) =>
    setAll((list) => {
      const mine = typeof next === 'function' ? next(list.filter((c) => c.report === kind)) : next;
      return [...list.filter((c) => c.report !== kind), ...mine];
    });
  const shown = useAutoCharts(charts);
  const title = TITLES[kind];
  const [reportDate, setDate] = React.useState(forum.reportDate ?? todayMsk());
  const [editing, setEditing] = React.useState(false);
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<'pptx' | 'pdf' | null>(null);

  React.useEffect(() => setAll(initial), [initial]);

  const apply = (
    res: { ok: true; data: ChartDTO[] } | { ok: false; error: string },
    msg = 'Сохранено',
  ) => {
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    markCacheStale();
    setAll(res.data);
    toast.success(msg, { id: 'saved' });
    return true;
  };

  // Перестановка блоков прямо на странице: перетаскивание за ручку
  const [dragId, setDragId] = React.useState<number | null>(null);
  const [overId, setOverId] = React.useState<number | null>(null);
  const moveChart = async (from: number, to: number) => {
    if (from === to || to < 0 || to >= charts.length) return;
    const prev = charts;
    const next = [...charts];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setCharts(next);
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
      const data = { forum, reportDate, charts: shown, title };
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
          <Button
            variant={editing ? 'default' : 'outline'}
            onClick={() => setEditing((e) => !e)}
            data-testid="report-edit"
          >
            {editing ? <X /> : <Pencil />}{' '}
            {editing ? 'Завершить редактирование' : 'Редактировать отчёт'}
          </Button>
          {kind === 'main' && (
            <>
              <Button variant="outline" onClick={() => setCopyOpen(true)}>
                <Copy /> Скопировать из другого форума
              </Button>
              <ReportExcelButtons
                forum={forum}
                reportDate={reportDate}
                charts={shown}
                onImported={(c) => {
                  markCacheStale();
                  setAll(c);
                }}
              />
            </>
          )}
          <Button
            onClick={() => exportAs('pptx')}
            disabled={!!busy || !charts.length}
            data-testid="export-pptx"
          >
            <Presentation /> {busy === 'pptx' ? 'Формируем…' : 'Скачать PPTX'}
          </Button>
          <Button
            onClick={() => exportAs('pdf')}
            disabled={!!busy || !charts.length}
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

      {editing && <ChartsEditor forumId={forum.id} kind={kind} charts={shown} apply={apply} />}

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
              const from = charts.findIndex((x) => x.id === dragId);
              setDragId(null);
              setOverId(null);
              if (from >= 0) void moveChart(from, i);
            }}
          >
            <ChartCard
              chart={c}
              count={charts.length}
              onSort={async (sort) => {
                setCharts((list) => list.map((x) => (x.id === c.id ? { ...x, sort } : x)));
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
        {charts.length === 0 && (
          <div className="rounded-md border border-dashed border-line p-10 text-center text-status-gray xl:col-span-2">
            В отчёте нет диаграмм. Нажмите «Редактировать отчёт», чтобы добавить.
          </div>
        )}
      </div>

      {kind === 'main' && (
        <CopyDialog
          open={copyOpen}
          onOpenChange={setCopyOpen}
          forumOptions={forumOptions}
          onCopy={async (sourceId, withAmounts) => {
            const res = await copyReportFrom(forum.id, sourceId, withAmounts);
            if (apply(res, 'Структура отчёта скопирована')) setCopyOpen(false);
          }}
        />
      )}
    </div>
  );
}

export function ChartCard({
  chart,
  count,
  onDragStart,
  onDragEnd,
  onSort,
}: {
  chart: Omit<ChartDTO, 'sort'> & { sort?: SortDir };
  count: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Смена порядка статей; без него переключатель не показывается */
  onSort?: (sort: SortDir) => void;
}) {
  const sort = chart.sort ?? 'desc';
  const total = chartTotal(chart.items);
  const segments = computeSegments(chart.items, chart.palette, sort);
  const hasNotes = segments.some((s) => s.note);
  return (
    <Card className="flex flex-col p-4" data-testid="report-chart">
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
        <h2 className="text-lg font-semibold">{chart.title}</h2>
        {chart.source && <AutoBadge source={chart.source} />}
        {onSort && <SortToggle value={sort} onChange={onSort} />}
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
                  {formatAmount(s.amount)}
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
                {formatAmount(total)}
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
      className="inline-flex shrink-0 items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[11px] text-ink/60 print:hidden"
      title={`${autoSource(source).hint}. Обновляется сама.`}
      data-testid="chart-auto"
    >
      <RefreshCw className="size-3" /> Авто
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
      className="ml-auto inline-flex shrink-0 rounded-md border border-line bg-surface p-0.5 print:hidden"
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

type Apply = (
  res: { ok: true; data: ChartDTO[] } | { ok: false; error: string },
  msg?: string,
) => boolean;

function ChartsEditor({
  forumId,
  kind,
  charts,
  apply,
}: {
  forumId: number;
  kind: ReportKind;
  charts: ChartDTO[];
  apply: Apply;
}) {
  const confirm = useConfirm();
  const [dragId, setDragId] = React.useState<number | null>(null);
  const [adding, setAdding] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  // Меню «Добавить диаграмму» закрывается кликом мимо него
  React.useEffect(() => {
    if (!adding) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setAdding(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [adding]);

  const add = async (source: AutoSource | null) => {
    setAdding(false);
    const a = source ? autoSource(source) : null;
    apply(
      await saveChart(forumId, {
        title: a?.title ?? 'Новая диаграмма',
        palette: a?.palette ?? 'BLUE',
        unit: 'млн руб.',
        report: kind,
        source,
      }),
      'Диаграмма добавлена',
    );
  };

  const move = async (from: number, to: number) => {
    if (to < 0 || to >= charts.length) return;
    const ids = charts.map((c) => c.id);
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    apply(await reorderCharts(forumId, ids), 'Порядок сохранён');
  };

  return (
    <div
      className="mt-4 rounded-md border border-brand/40 bg-brand-light/40 p-4"
      data-testid="charts-editor"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">Диаграммы отчёта</h2>
        <div className="relative" ref={menuRef}>
          <Button size="sm" onClick={() => setAdding((a) => !a)} data-testid="chart-add">
            <Plus /> Добавить диаграмму
          </Button>
          {adding && (
            <div
              className="absolute right-0 z-20 mt-1 w-80 rounded-md border border-line bg-white p-1 shadow-lg"
              data-testid="chart-add-menu"
            >
              <button
                type="button"
                className="w-full rounded px-3 py-2 text-left text-sm hover:bg-surface"
                onClick={() => add(null)}
              >
                <div className="font-medium">Пустая диаграмма</div>
                <div className="text-xs text-ink/60">Строки и суммы вносятся вручную</div>
              </button>
              <div className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-ink/50">
                Из вкладок «Расходы» и «Доходы»
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
      </div>
      <p className="mb-3 text-xs text-ink/70">
        Порядок диаграмм — это порядок слайдов в презентации. Перетащите карточку за значок ⋮⋮ или
        используйте стрелки. Диаграммы с меткой «Авто» строятся из вкладок «Расходы» и «Доходы» и
        обновляются сами; их строки можно перевести в ручные.
      </p>
      <div className="space-y-3">
        {charts.map((c, i) => (
          <div
            key={c.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId === null || dragId === c.id) return;
              void move(
                charts.findIndex((x) => x.id === dragId),
                i,
              );
              setDragId(null);
            }}
            className={cn(
              'rounded-md border border-line bg-white p-3',
              dragId === c.id && 'opacity-50',
            )}
          >
            <ChartEditorRow
              chart={c}
              index={i}
              count={charts.length}
              onMove={move}
              onDragStart={() => setDragId(c.id)}
              onSave={async (patch) =>
                apply(
                  await saveChart(forumId, {
                    id: c.id,
                    title: c.title,
                    palette: c.palette,
                    unit: c.unit,
                    ...patch,
                  }),
                )
              }
              onSaveItems={async (items) => apply(await saveChartItems(forumId, c.id, items))}
              onDelete={async () => {
                const ok = await confirm({
                  title: `Удалить диаграмму «${c.title}»?`,
                  confirmText: 'Удалить',
                  danger: true,
                });
                if (ok) apply(await deleteChart(forumId, c.id), 'Диаграмма удалена');
              }}
            />
          </div>
        ))}
      </div>
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

function ChartEditorRow({
  chart,
  index,
  count,
  onMove,
  onDragStart,
  onSave,
  onSaveItems,
  onDelete,
}: {
  chart: ChartDTO;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onDragStart: () => void;
  onSave: (p: Partial<{ title: string; palette: PaletteKey; unit: string }>) => void;
  onSaveItems: (items: { name: string; amount: number; note: string | null }[]) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [title, setTitle] = React.useState(chart.title);
  const [unit, setUnit] = React.useState(chart.unit);
  const toDraft = React.useCallback(
    () =>
      chart.items.map((i) => ({
        key: String(i.id),
        name: i.name,
        amount: formatAmount(i.amount).replace(/\s/g, ''),
        note: i.note ?? '',
      })),
    [chart.items],
  );
  const [items, setItems] = React.useState<DraftItem[]>(toDraft);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  // Данные с сервера принимаем, только если нет несохранённых правок
  React.useEffect(() => {
    if (!dirty) setItems(toDraft());
  }, [toDraft, dirty]);
  React.useEffect(() => setTitle(chart.title), [chart.title]);
  React.useEffect(() => setUnit(chart.unit), [chart.unit]);

  const change = (list: DraftItem[]) => {
    setItems(list);
    setDirty(true);
    setError('');
  };
  const update = (k: number, patch: Partial<DraftItem>) =>
    change(items.map((x, i) => (i === k ? { ...x, ...patch } : x)));

  const save = async () => {
    const parsed: { name: string; amount: number; note: string | null }[] = [];
    for (const [k, i] of items.entries()) {
      if (!i.name.trim() && !i.amount.trim() && !i.note.trim()) continue;
      const a = parseAmount(i.amount || '0');
      if (!i.name.trim()) return setError(`Строка ${k + 1}: укажите название статьи`);
      if (a === null || a < 0)
        return setError(`Строка ${k + 1}: сумма должна быть числом, например 6,21`);
      parsed.push({ name: i.name.trim(), amount: a, note: i.note.trim() || null });
    }
    setSaving(true);
    const ok = await onSaveItems(parsed);
    setSaving(false);
    if (ok) setDirty(false);
  };

  const total = items.reduce((s, i) => s + (parseAmount(i.amount) ?? 0), 0);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <span
          draggable
          onDragStart={onDragStart}
          className="mb-2 cursor-grab text-status-gray hover:text-ink"
          title="Перетащите, чтобы изменить порядок"
        >
          <GripVertical className="size-4" />
        </span>
        <span className="mb-2 w-6 text-sm text-ink/60">{index + 1}.</span>
        <Field label="Название диаграммы" className="min-w-[200px] flex-1">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== chart.title && onSave({ title: title.trim() })}
          />
        </Field>
        <Field label="Цветовая гамма" className="w-36">
          <Select
            value={chart.palette}
            onChange={(e) => onSave({ palette: e.target.value as PaletteKey })}
          >
            {(Object.keys(PALETTES) as PaletteKey[]).map((p) => (
              <option key={p} value={p}>
                {PALETTES[p].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Единица" className="w-32">
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            onBlur={() => unit.trim() && unit !== chart.unit && onSave({ unit: unit.trim() })}
          />
        </Field>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
            title="Выше"
          >
            <ArrowUp />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={index === count - 1}
            onClick={() => onMove(index, index + 1)}
            title="Ниже"
          >
            <ArrowDown />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-status-red"
            onClick={onDelete}
            title="Удалить диаграмму"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {chart.source ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-surface px-3 py-2 text-sm">
          <RefreshCw className="size-4 shrink-0 text-ink/50" />
          <span className="mr-auto text-ink/70">
            {autoSource(chart.source).hint}: строки обновляются сами
            {chart.items.length ? '' : ' (пока данных нет)'}.
          </span>
          <Button
            size="sm"
            variant="outline"
            data-testid="chart-detach"
            onClick={() =>
              onSaveItems(
                chart.items.map((i) => ({ name: i.name, amount: i.amount, note: i.note })),
              )
            }
            title="Зафиксировать текущие строки и править их вручную; обновляться сами они перестанут"
          >
            <Pencil /> Править строки вручную
          </Button>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-ink/60">
              <tr>
                <th className="w-8" />
                <th className="px-1 py-1">Статья</th>
                <th className="w-32 px-1 py-1">Сумма ({chart.unit})</th>
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
                      aria-label="Сумма"
                      placeholder="0,00"
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
                      onClick={() => {
                        const l = [...items];
                        [l[k - 1], l[k]] = [l[k], l[k - 1]];
                        change(l);
                      }}
                      title="Выше"
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="iconSm"
                      variant="ghost"
                      disabled={k === items.length - 1}
                      onClick={() => {
                        const l = [...items];
                        [l[k + 1], l[k]] = [l[k], l[k + 1]];
                        change(l);
                      }}
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
            >
              <Plus /> Добавить строку
            </Button>
            <span className="text-sm font-semibold tabular-nums">Итого: {formatAmount(total)}</span>
            <div className="ml-auto flex items-center gap-2">
              {dirty && (
                <span className="text-xs text-yellow-800">Есть несохранённые изменения</span>
              )}
              {dirty && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDirty(false);
                    setItems(toDraft());
                    setError('');
                  }}
                >
                  Отменить
                </Button>
              )}
              <Button onClick={save} disabled={!dirty || saving} data-testid="save-items">
                {saving ? 'Сохраняем…' : 'Сохранить строки'}
              </Button>
            </div>
          </div>
          {error && <p className="mt-1 text-xs text-status-red">{error}</p>}
        </div>
      )}
    </div>
  );
}

function CopyDialog({
  open,
  onOpenChange,
  forumOptions,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  forumOptions: { id: number; name: string }[];
  onCopy: (sourceId: number, withAmounts: boolean) => Promise<void>;
}) {
  const [source, setSource] = React.useState('');
  const [withAmounts, setWithAmounts] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Скопировать структуру отчёта"
        description="Текущие диаграммы отчёта будут заменены диаграммами выбранного форума."
      >
        <div className="space-y-3">
          <Field label="Форум-источник">
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">— выберите форум —</option>
              {forumOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="space-y-1 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                className="accent-brand"
                checked={!withAmounts}
                onChange={() => setWithAmounts(false)}
              />
              Названия диаграмм и строк без сумм
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                className="accent-brand"
                checked={withAmounts}
                onChange={() => setWithAmounts(true)}
              />
              Вместе с суммами
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={!source || pending}
            onClick={async () => {
              setPending(true);
              await onCopy(Number(source), withAmounts);
              setPending(false);
            }}
          >
            Скопировать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
