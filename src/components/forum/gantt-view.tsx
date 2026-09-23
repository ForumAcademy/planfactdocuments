'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Minus,
  Plus as PlusIcon,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  addDays,
  diffDays,
  formatDate,
  maxDate,
  minDate,
  monthName,
  startOfWeek,
  type ISODate,
} from '@/lib/dates';
import { STATUS_LABEL, TONE_COLOR, barTone, lagDays } from '@/lib/status';
import { stageBounds } from '@/lib/term-parser';
import { stageNumber, toTermRefs } from '@/lib/plan';
import type { TaskDTO } from '@/lib/types';
import { cn } from '@/lib/utils';
import { FilterBar } from './filter-bar';
import { useForum } from './forum-context';
import { Highlight } from './highlight';

type Scale = 'day' | 'week' | 'month';
const PX_PER_DAY: Record<Scale, number> = { day: 30, week: 9, month: 2.6 };
const ROW_H = 30;
const HEADER_H = 62;
const TOP_H = 22;
const MARK_H = 16;
const BOTTOM_H = HEADER_H - TOP_H - MARK_H;
const TREE_W = 380;

type Row =
  | {
      kind: 'stage';
      key: string;
      label: string;
      color: string;
      tasks: TaskDTO[];
      collapsed: boolean;
    }
  | {
      kind: 'block';
      key: string;
      label: string;
      color: string;
      tasks: TaskDTO[];
      collapsed: boolean;
    }
  | { kind: 'task'; key: string; task: TaskDTO; color: string };

interface UndoItem {
  id: number;
  startDate: ISODate | null;
  endDate: ISODate | null;
}

interface DragState {
  id: number;
  mode: 'move' | 'start' | 'end';
  x0: number;
  start: ISODate;
  end: ISODate;
  delta: number;
  moved: boolean;
}

export function GanttView() {
  const { visible, tasks, forum, today, lookups, patchTask, setOpenTaskId, filters } = useForum();
  const [scale, setScale] = React.useState<Scale>('week');
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [undo, setUndo] = React.useState<UndoItem[]>([]);
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [hover, setHover] = React.useState<{ task: TaskDTO; x: number; y: number } | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const px = PX_PER_DAY[scale];
  const refs = toTermRefs(forum);
  const forumEnd = forum.endDate ?? forum.startDate;

  // Диапазон шкалы — по всем задачам форума (не зависит от фильтров)
  const range = React.useMemo(() => {
    let from = addDays(forum.salesStartDate, -60);
    let to = addDays(forumEnd, 30);
    for (const t of tasks) {
      if (t.startDate) from = minDate(from, t.startDate);
      if (t.endDate) to = maxDate(to, t.endDate);
    }
    from = minDate(from, today);
    to = maxDate(to, today);
    const pad = scale === 'day' ? 7 : scale === 'week' ? 14 : 30;
    from = startOfWeek(addDays(from, -pad));
    to = addDays(to, pad);
    return { from, to, days: diffDays(from, to) + 1 };
  }, [tasks, forum.salesStartDate, forumEnd, today, scale]);

  const x = React.useCallback((d: ISODate) => diffDays(range.from, d) * px, [range.from, px]);
  const width = range.days * px;

  /** Даты для отображения: задача без дат — ромб на конце этапа. */
  const effective = React.useCallback(
    (t: TaskDTO): { start: ISODate; end: ISODate; noDate: boolean } => {
      if (t.startDate && t.endDate && !t.needsClarification)
        return { start: t.startDate, end: t.endDate, noDate: false };
      const stage = t.stageId ? lookups.stage.get(t.stageId) : null;
      const b = stageBounds(stageNumber(stage), refs);
      return { start: b.end, end: b.end, noDate: true };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookups.stage, forum],
  );

  const rows = React.useMemo<Row[]>(() => {
    const out: Row[] = [];
    const byStage = new Map<string, TaskDTO[]>();
    for (const t of visible) {
      const k = t.stageId ? String(t.stageId) : 'none';
      if (!byStage.has(k)) byStage.set(k, []);
      byStage.get(k)!.push(t);
    }
    const stageOrder = (k: string) =>
      k === 'none' ? 1e9 : (lookups.stage.get(Number(k))?.order ?? 1e8);
    for (const [sk, list] of [...byStage.entries()].sort(
      (a, b) => stageOrder(a[0]) - stageOrder(b[0]),
    )) {
      const stage = sk === 'none' ? null : lookups.stage.get(Number(sk));
      const color = stage?.color ?? '#8A94A6';
      const skey = `s${sk}`;
      const sCollapsed = collapsed.has(skey);
      out.push({
        kind: 'stage',
        key: skey,
        label: stage?.name ?? 'Без этапа',
        color,
        tasks: list,
        collapsed: sCollapsed,
      });
      if (sCollapsed) continue;
      const byBlock = new Map<string, TaskDTO[]>();
      for (const t of list) {
        const k = t.blockId ? String(t.blockId) : 'none';
        if (!byBlock.has(k)) byBlock.set(k, []);
        byBlock.get(k)!.push(t);
      }
      for (const [bk, blist] of byBlock) {
        const bkey = `${skey}b${bk}`;
        const bCollapsed = collapsed.has(bkey);
        out.push({
          kind: 'block',
          key: bkey,
          label: bk === 'none' ? 'Без блока' : (lookups.block.get(Number(bk)) ?? ''),
          color,
          tasks: blist,
          collapsed: bCollapsed,
        });
        if (bCollapsed) continue;
        for (const t of blist) out.push({ kind: 'task', key: `t${t.id}`, task: t, color });
      }
    }
    return out;
  }, [visible, lookups, collapsed]);

  const toggle = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const collapseAll = (to: 'stage' | 'block' | 'none') => {
    if (to === 'none') return setCollapsed(new Set());
    const keys = rows.filter((r) => r.kind === to).map((r) => r.key);
    setCollapsed(new Set(keys));
  };

  const scrollToDate = React.useCallback(
    (d: ISODate, smooth = true) => {
      const el = scrollRef.current;
      if (!el) return;
      const left = x(d) - (el.clientWidth - TREE_W) / 3;
      el.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
    },
    [x],
  );

  // При открытии и смене масштаба — показываем сегодняшний день
  React.useEffect(() => {
    scrollToDate(today, false);
  }, [scale, scrollToDate, today]);

  const doUndo = React.useCallback(async () => {
    const last = undo[undo.length - 1];
    if (!last) return;
    setUndo((u) => u.slice(0, -1));
    await patchTask(
      last.id,
      { startDate: last.startDate, endDate: last.endDate },
      { silent: true },
    );
    const { toast } = await import('sonner');
    toast.success('Изменение отменено', { id: 'saved' });
  }, [undo, patchTask]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable=true]')) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'я' || e.code === 'KeyZ')) {
        e.preventDefault();
        void doUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo]);

  // Перетаскивание полос (состояние дублируется в ref, чтобы обработчики видели актуальное значение)
  const dragRef = React.useRef<DragState | null>(null);
  const startDrag = (d: DragState) => {
    dragRef.current = d;
    setDrag(d);
  };
  React.useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = {
        ...d,
        delta: Math.round((e.clientX - d.x0) / px),
        moved: d.moved || Math.abs(e.clientX - d.x0) > 3,
      };
      dragRef.current = next;
      setDrag(next);
    };
    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      const task = tasks.find((t) => t.id === d.id);
      if (!d.moved) {
        setOpenTaskId(d.id);
      } else if (task && d.delta !== 0) {
        const { start, end } = applyDrag(d);
        setUndo((u) => [
          ...u.slice(-49),
          { id: task.id, startDate: task.startDate, endDate: task.endDate },
        ]);
        void patchTask(task.id, { startDate: start, endDate: end });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag?.id, px, tasks, patchTask, setOpenTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Шкала времени
  const header = React.useMemo(() => {
    const top: { label: string; left: number; width: number }[] = [];
    const bottom: { label: string; left: number; width: number; weekend?: boolean }[] = [];
    const end = range.to;
    if (scale === 'month') {
      // верх — годы, низ — месяцы
      let d = `${range.from.slice(0, 7)}-01`;
      while (d <= end) {
        const next = `${Number(d.slice(0, 4)) + (d.slice(5, 7) === '12' ? 1 : 0)}-${String((Number(d.slice(5, 7)) % 12) + 1).padStart(2, '0')}-01`;
        bottom.push({
          label: cap(monthName(d, true)),
          left: x(maxDate(d, range.from)),
          width: x(next) - x(maxDate(d, range.from)),
        });
        d = next;
      }
      let y = Number(range.from.slice(0, 4));
      while (`${y}-01-01` <= end) {
        const s = maxDate(`${y}-01-01`, range.from);
        top.push({ label: String(y), left: x(s), width: x(`${y + 1}-01-01`) - x(s) });
        y++;
      }
    } else {
      let d = `${range.from.slice(0, 7)}-01`;
      while (d <= end) {
        const next = `${Number(d.slice(0, 4)) + (d.slice(5, 7) === '12' ? 1 : 0)}-${String((Number(d.slice(5, 7)) % 12) + 1).padStart(2, '0')}-01`;
        const s = maxDate(d, range.from);
        top.push({
          label: `${cap(monthName(d))} ${d.slice(0, 4)}`,
          left: x(s),
          width: x(next) - x(s),
        });
        d = next;
      }
      if (scale === 'day') {
        for (let i = 0; i < range.days; i++) {
          const day = addDays(range.from, i);
          const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
          bottom.push({
            label: String(Number(day.slice(8))),
            left: i * px,
            width: px,
            weekend: wd === 0 || wd === 6,
          });
        }
      } else {
        for (let w = range.from; w <= end; w = addDays(w, 7)) {
          bottom.push({ label: formatDate(w).slice(0, 5), left: x(w), width: 7 * px });
        }
      }
    }
    return { top, bottom };
  }, [range, scale, x, px]);

  const markers = [
    {
      date: today,
      label: 'Сегодня',
      cls: 'border-l-2 border-dashed border-brand',
      text: 'text-brand',
    },
    {
      date: forum.salesStartDate,
      label: 'Старт продаж',
      cls: 'border-l-2 border-status-green',
      text: 'text-status-green',
    },
    {
      date: forum.startDate,
      label: 'Дата форума',
      cls: 'border-l-[3px] border-ink',
      text: 'text-ink font-semibold',
    },
  ];

  const bodyH = rows.length * ROW_H;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4">
      <FilterBar />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-md border border-line bg-surface p-0.5 text-sm"
          role="group"
          aria-label="Масштаб"
        >
          {(
            [
              ['day', 'Дни'],
              ['week', 'Недели'],
              ['month', 'Месяцы'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setScale(k)}
              className={cn(
                'rounded px-3 py-1.5',
                scale === k ? 'bg-white font-medium text-brand shadow-sm' : 'text-ink/70',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => scrollToDate(today)}>
          <Crosshair /> К сегодняшнему дню
        </Button>
        <Button variant="outline" size="sm" onClick={() => scrollToDate(forum.startDate)}>
          К дате форума
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => collapseAll('stage')}
          title="Свернуть этапы"
        >
          <Minus /> Свернуть
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => collapseAll('none')}
          title="Развернуть всё"
        >
          <PlusIcon /> Развернуть
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={doUndo}
          disabled={!undo.length}
          title="Отменить (Ctrl+Z)"
          className="ml-auto"
          data-testid="gantt-undo"
        >
          <Undo2 /> Отменить{undo.length ? ` (${undo.length})` : ''}
        </Button>
      </div>
      <Legend />

      <div
        ref={scrollRef}
        className="thin-scroll relative mt-2 max-h-[calc(100vh-260px)] min-h-[360px] overflow-auto rounded-md border border-line bg-white"
        data-testid="gantt"
        onMouseLeave={() => setHover(null)}
      >
        <div className="relative" style={{ width: TREE_W + width, height: HEADER_H + bodyH }}>
          {/* Шапка шкалы */}
          <div className="sticky top-0 z-30 flex" style={{ height: HEADER_H }}>
            <div
              className="sticky left-0 z-40 flex shrink-0 items-end border-b border-r border-line bg-surface px-3 pb-1.5 text-xs font-medium text-ink/70"
              style={{ width: TREE_W }}
            >
              Этап / блок / задача
            </div>
            <div className="relative shrink-0 border-b border-line bg-surface" style={{ width }}>
              {header.top.map((h, i) => (
                <div
                  key={i}
                  className="absolute top-0 truncate border-l border-line px-1.5 pt-1 text-xs font-medium text-ink/80"
                  style={{ left: h.left, width: h.width, height: TOP_H }}
                >
                  {h.label}
                </div>
              ))}
              {header.bottom.map((h, i) => (
                <div
                  key={i}
                  className={cn(
                    'absolute truncate border-l border-t border-line text-center text-[11px] text-ink/60',
                    h.weekend && 'bg-line/60',
                  )}
                  style={{
                    left: h.left,
                    width: h.width,
                    top: TOP_H + MARK_H,
                    height: BOTTOM_H,
                    lineHeight: `${BOTTOM_H}px`,
                  }}
                >
                  {h.label}
                </div>
              ))}
              {markers.map((m) =>
                m.date >= range.from && m.date <= range.to ? (
                  <div
                    key={m.label}
                    className={cn(
                      'absolute z-10 whitespace-nowrap px-1 text-[10px] leading-4',
                      m.text,
                    )}
                    style={{ left: x(m.date) + 1, top: TOP_H }}
                  >
                    {m.label}
                  </div>
                ) : null,
              )}
            </div>
          </div>

          {/* Фон: выходные и вертикальные линии */}
          <div
            className="pointer-events-none absolute"
            style={{ left: TREE_W, top: HEADER_H, width, height: bodyH }}
          >
            {scale === 'day' &&
              header.bottom
                .filter((h) => h.weekend)
                .map((h, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full bg-surface"
                    style={{ left: h.left, width: h.width }}
                  />
                ))}
            {scale !== 'day' &&
              header.bottom.map((h, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full border-l border-line/60"
                  style={{ left: h.left }}
                />
              ))}
            {markers.map((m) =>
              m.date >= range.from && m.date <= range.to ? (
                <div
                  key={m.label}
                  className={cn('absolute top-0 z-20 h-full', m.cls)}
                  style={{ left: x(m.date) + (m.date === today ? px / 2 : 0) }}
                  title={`${m.label}: ${formatDate(m.date)}`}
                />
              ) : null,
            )}
            {forum.endDate && forum.endDate !== forum.startDate && (
              <div
                className="absolute top-0 z-10 h-full bg-ink/5"
                style={{
                  left: x(forum.startDate),
                  width: x(addDays(forum.endDate, 1)) - x(forum.startDate),
                }}
              />
            )}
          </div>

          {/* Строки */}
          {rows.map((r, i) => {
            const top = HEADER_H + i * ROW_H;
            return (
              <div
                key={r.key}
                className="absolute left-0 flex"
                style={{ top, height: ROW_H, width: TREE_W + width }}
              >
                <TreeCell
                  row={r}
                  onToggle={() => r.kind !== 'task' && toggle(r.key)}
                  onOpen={(id) => setOpenTaskId(id)}
                  query={filters.q}
                />
                <div
                  className={cn(
                    'relative shrink-0 border-b border-line/50',
                    r.kind !== 'task' && 'bg-surface/50',
                  )}
                  style={{ width }}
                >
                  {r.kind === 'task' ? (
                    <TaskBar
                      task={r.task}
                      eff={effective(r.task)}
                      drag={drag?.id === r.task.id ? drag : null}
                      x={x}
                      px={px}
                      today={today}
                      onPointerDown={(e, mode, eff) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        setHover(null);
                        startDrag({
                          id: r.task.id,
                          mode,
                          x0: e.clientX,
                          start: eff.start,
                          end: eff.end,
                          delta: 0,
                          moved: false,
                        });
                      }}
                      onHover={(e) =>
                        !drag && setHover({ task: r.task, x: e.clientX, y: e.clientY })
                      }
                      onLeave={() => setHover(null)}
                    />
                  ) : (
                    <SummaryBar
                      tasks={r.tasks}
                      color={r.color}
                      x={x}
                      kind={r.kind}
                      effective={effective}
                    />
                  )}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div
              className="absolute left-0 right-0 py-16 text-center text-sm text-status-gray"
              style={{ top: HEADER_H }}
            >
              Нет задач, подходящих под фильтры
            </div>
          )}
        </div>
      </div>
      {hover && !drag && <Tooltip {...hover} />}
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function applyDrag(d: DragState): { start: ISODate; end: ISODate } {
  let start = d.start;
  let end = d.end;
  if (d.mode === 'move') {
    start = addDays(start, d.delta);
    end = addDays(end, d.delta);
  } else if (d.mode === 'start') {
    start = minDate(addDays(start, d.delta), end);
  } else {
    end = maxDate(addDays(end, d.delta), start);
  }
  return { start, end };
}

function TreeCell({
  row,
  onToggle,
  onOpen,
  query,
}: {
  row: Row;
  onToggle: () => void;
  onOpen: (id: number) => void;
  query: string;
}) {
  const base =
    'sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-b border-r border-line/60 pr-2 text-sm';
  if (row.kind === 'task') {
    const t = row.task;
    return (
      <button
        type="button"
        onClick={() => onOpen(t.id)}
        className={cn(base, 'bg-white pl-9 text-left hover:bg-surface')}
        style={{ width: TREE_W }}
        title={t.description}
      >
        <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-ink/50">
          {t.number}
        </span>
        <span className="truncate text-[13px]">
          <Highlight text={t.description} query={query} />
        </span>
      </button>
    );
  }
  const done = row.tasks.filter((t) => t.status === 'DONE').length;
  const pct = row.tasks.length ? Math.round((done / row.tasks.length) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        base,
        'text-left',
        row.kind === 'stage'
          ? 'bg-surface pl-2 font-semibold'
          : 'bg-white pl-5 font-medium text-ink/85',
      )}
      style={{ width: TREE_W }}
    >
      {row.collapsed ? (
        <ChevronRight className="size-4 shrink-0" />
      ) : (
        <ChevronDown className="size-4 shrink-0" />
      )}
      {row.kind === 'stage' && (
        <span className="h-3.5 w-1.5 shrink-0 rounded-sm" style={{ background: row.color }} />
      )}
      <span className="truncate">{row.label}</span>
      <span className="ml-auto shrink-0 text-[11px] font-normal text-ink/60">
        {row.tasks.length} · {pct}%
      </span>
    </button>
  );
}

function SummaryBar({
  tasks,
  color,
  x,
  kind,
  effective,
}: {
  tasks: TaskDTO[];
  color: string;
  x: (d: ISODate) => number;
  kind: 'stage' | 'block';
  effective: (t: TaskDTO) => { start: ISODate; end: ISODate };
}) {
  if (!tasks.length) return null;
  let s = effective(tasks[0]).start;
  let e = effective(tasks[0]).end;
  for (const t of tasks) {
    const ef = effective(t);
    s = minDate(s, ef.start);
    e = maxDate(e, ef.end);
  }
  const done = tasks.filter((t) => t.status === 'DONE').length;
  const pct = Math.round((done / tasks.length) * 100);
  const left = x(s);
  const w = Math.max(4, x(addDays(e, 1)) - left);
  const h = kind === 'stage' ? 12 : 8;
  return (
    <div
      className="absolute rounded-sm"
      style={{
        left,
        width: w,
        top: (ROW_H - h) / 2,
        height: h,
        background: `${color}33`,
        border: `1px solid ${color}`,
      }}
      title={`${formatDate(s)} – ${formatDate(e)} · выполнено ${pct}%`}
    >
      <div className="h-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function TaskBar({
  task,
  eff,
  drag,
  x,
  px,
  today,
  onPointerDown,
  onHover,
  onLeave,
}: {
  task: TaskDTO;
  eff: { start: ISODate; end: ISODate; noDate: boolean };
  drag: DragState | null;
  x: (d: ISODate) => number;
  px: number;
  today: ISODate;
  onPointerDown: (
    e: React.PointerEvent,
    mode: DragState['mode'],
    eff: { start: ISODate; end: ISODate },
  ) => void;
  onHover: (e: React.MouseEvent) => void;
  onLeave: () => void;
}) {
  const { start, end } = drag ? applyDrag(drag) : eff;
  const tone = barTone(task, today);
  const color = TONE_COLOR[tone];
  const left = x(start);
  const w = x(addDays(end, 1)) - left;

  if (eff.noDate && !drag) {
    // Ромб на дату окончания этапа
    const cx = x(end) + px / 2;
    return (
      <div
        className="absolute flex items-center gap-1"
        style={{ left: cx - 7, top: ROW_H / 2 - 7 }}
        onMouseMove={onHover}
        onMouseLeave={onLeave}
        onPointerDown={(e) => onPointerDown(e, 'move', eff)}
        data-testid="gantt-diamond"
      >
        <span className="block size-3.5 rotate-45 cursor-grab border-2 border-yellow-500 bg-yellow-300" />
        <span className="whitespace-nowrap rounded bg-yellow-100 px-1 text-[10px] font-medium text-yellow-800">
          уточнить срок
        </span>
      </div>
    );
  }
  if (start === end && px < 12) {
    // Веха (контрольная точка) при мелком масштабе
    return (
      <div
        className="absolute cursor-grab"
        style={{ left: x(start) + px / 2 - 7, top: ROW_H / 2 - 7 }}
        onMouseMove={onHover}
        onMouseLeave={onLeave}
        onPointerDown={(e) => onPointerDown(e, 'move', eff)}
        data-testid="gantt-bar"
        data-task-id={task.id}
      >
        <span
          className="block size-3.5 rotate-45 border border-white"
          style={{ background: color }}
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'group absolute flex cursor-grab items-center rounded shadow-sm active:cursor-grabbing',
        drag && 'opacity-80 ring-2 ring-brand/40',
      )}
      style={{ left, width: Math.max(w, 6), top: 6, height: ROW_H - 12, background: color }}
      onMouseMove={onHover}
      onMouseLeave={onLeave}
      onPointerDown={(e) => onPointerDown(e, 'move', eff)}
      data-testid="gantt-bar"
      data-task-id={task.id}
    >
      <span
        className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l opacity-0 group-hover:bg-black/20 group-hover:opacity-100"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(e, 'start', eff);
        }}
      />
      <span
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r opacity-0 group-hover:bg-black/20 group-hover:opacity-100"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(e, 'end', eff);
        }}
        data-testid="gantt-resize-end"
      />
      {drag && (
        <span className="pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded bg-ink px-1 text-[10px] text-white">
          {formatDate(start)} – {formatDate(end)}
        </span>
      )}
    </div>
  );
}

function Tooltip({ task, x, y }: { task: TaskDTO; x: number; y: number }) {
  const { today, lookups } = useForum();
  const lag = lagDays(task, today);
  const left = Math.min(x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 340);
  const top = Math.min(y + 14, (typeof window !== 'undefined' ? window.innerHeight : 800) - 190);
  return (
    <div
      className="pointer-events-none fixed z-50 w-80 rounded-md border border-line bg-white p-3 text-xs shadow-lg"
      style={{ left, top }}
      role="tooltip"
    >
      <div className="mb-1 text-[11px] text-ink/60">№{task.number}</div>
      <div className="mb-2 text-sm font-medium leading-snug">{task.description}</div>
      <div className="grid grid-cols-[92px_1fr] gap-y-0.5">
        <span className="text-ink/60">Даты</span>
        <span>
          {formatDate(task.startDate)} – {formatDate(task.endDate)}
        </span>
        <span className="text-ink/60">Срок</span>
        <span>{task.termText || '—'}</span>
        <span className="text-ink/60">Ответственные</span>
        <span>
          {task.employeeIds.map((e) => lookups.employee.get(e)?.fullName).join(', ') || '—'}
        </span>
        <span className="text-ink/60">Статус</span>
        <span>{STATUS_LABEL[task.status]}</span>
        <span className="text-ink/60">Отставание</span>
        <span className={lag > 0 ? 'font-semibold text-status-red' : ''}>
          {lag > 0 ? `+${lag} дн.` : 'нет'}
        </span>
      </div>
      {task.needsClarification && (
        <div className="mt-2 flex items-center gap-1 text-yellow-700">
          <AlertTriangle className="size-3" /> Срок не распознан — уточнить срок
        </div>
      )}
      <div className="mt-2 text-[11px] text-ink/50">
        Клик — открыть карточку, перетаскивание — изменить даты
      </div>
    </div>
  );
}

function Legend() {
  const items = [
    { c: TONE_COLOR.gray, l: 'Не начато' },
    { c: TONE_COLOR.green, l: 'В работе в срок' },
    { c: TONE_COLOR.red, l: 'Просрочено' },
    { c: TONE_COLOR.blue, l: 'Выполнено' },
  ];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/70">
      {items.map((i) => (
        <span key={i.l} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm" style={{ background: i.c }} /> {i.l}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rotate-45 border border-yellow-500 bg-yellow-300" /> уточнить срок
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 border-l-2 border-dashed border-brand" /> сегодня
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 border-l-2 border-status-green" /> старт продаж
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 border-l-[3px] border-ink" /> дата форума
      </span>
    </div>
  );
}
