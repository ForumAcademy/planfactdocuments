'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Copy,
  Columns3,
  GripVertical,
  List,
  MoreHorizontal,
  PanelRightOpen,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { SortKey } from '@/lib/filters';
import { TONE_COLOR, isOverdue, lagDays, shouldStart } from '@/lib/status';
import type { TaskDTO } from '@/lib/types';
import { cn, pluralRu } from '@/lib/utils';
import { FilterBar } from './filter-bar';
import { useForum } from './forum-context';
import { Highlight } from './highlight';
import { DateCell, EmployeesCell, StatusCell, TextCell } from './cells';
import { BulkBar } from './bulk-bar';
import { KanbanView } from './kanban-view';

type ViewMode = 'table' | 'kanban';

export function TasksView() {
  const [mode, setMode] = React.useState<ViewMode>('table');
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('tasks-view');
      if (saved === 'kanban' || saved === 'table') setMode(saved);
    } catch {
      /* нет доступа к localStorage */
    }
  }, []);
  const changeMode = (m: ViewMode) => {
    setMode(m);
    try {
      localStorage.setItem('tasks-view', m);
    } catch {
      /* ignore */
    }
  };
  const { addTask, setOpenTaskId, filters, dicts } = useForum();

  const onAdd = async () => {
    const stageId =
      filters.stage.length === 1
        ? filters.stage[0]
        : (dicts.stages.find((s) => !s.archived)?.id ?? null);
    const t = await addTask({ description: 'Новая задача', stageId });
    if (t) setOpenTaskId(t.id);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4">
      <FilterBar />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div
          className="inline-flex h-9 rounded-md border border-line bg-surface p-0.5 text-sm"
          role="group"
          aria-label="Вид"
        >
          <button
            type="button"
            onClick={() => changeMode('table')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-3 pb-0.5',
              mode === 'table' ? 'bg-white font-medium text-brand shadow-sm' : 'text-ink/70',
            )}
          >
            <List className="size-4" /> Таблица
          </button>
          <button
            type="button"
            onClick={() => changeMode('kanban')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-3 pb-0.5',
              mode === 'kanban' ? 'bg-white font-medium text-brand shadow-sm' : 'text-ink/70',
            )}
          >
            <Columns3 className="size-4" /> По статусам
          </button>
        </div>
        <Button onClick={onAdd} className="ml-auto" data-testid="add-task">
          <Plus /> Добавить задачу
        </Button>
      </div>
      <div className="mt-3">{mode === 'table' ? <TaskTable /> : <KanbanView />}</div>
    </div>
  );
}

const COLUMNS: { key: string; label: string; sort?: SortKey; className?: string }[] = [
  { key: 'num', label: '№', sort: 'number', className: 'w-12' },
  { key: 'block', label: 'Блок', sort: 'block', className: 'w-36' },
  { key: 'desc', label: 'Задача', className: 'min-w-[260px]' },
  { key: 'term', label: 'Срок (текст)', className: 'w-40' },
  { key: 'start', label: 'Дата начала', sort: 'start', className: 'w-[112px]' },
  { key: 'end', label: 'Дата окончания', sort: 'end', className: 'w-[112px]' },
  { key: 'role', label: 'Роль', sort: 'role', className: 'w-32' },
  { key: 'emp', label: 'Ответственный', sort: 'employee', className: 'w-44' },
  { key: 'status', label: 'Статус', sort: 'status', className: 'w-36' },
  { key: 'lag', label: 'Отставание', sort: 'lag', className: 'w-24' },
  { key: 'comment', label: 'Комментарий', className: 'min-w-[180px]' },
];

function TaskTable() {
  const { visible, dicts, lookups, filters, setFilters, tasks, reorder, patchTask } = useForum();
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [dragId, setDragId] = React.useState<number | null>(null);
  const [dropTarget, setDropTarget] = React.useState<number | null>(null);

  // Выделение только среди видимых задач
  React.useEffect(() => {
    const ids = new Set(visible.map((t) => t.id));
    setSelected((s) => {
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [visible]);

  const groups = React.useMemo(() => {
    const map = new Map<string, TaskDTO[]>();
    for (const t of visible) {
      const key = t.stageId ? String(t.stageId) : 'none';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    const allByStage = new Map<string, TaskDTO[]>();
    for (const t of tasks) {
      const key = t.stageId ? String(t.stageId) : 'none';
      if (!allByStage.has(key)) allByStage.set(key, []);
      allByStage.get(key)!.push(t);
    }
    const order = (k: string) =>
      k === 'none' ? 1e9 : (lookups.stage.get(Number(k))?.order ?? 1e8);
    return [...map.entries()]
      .sort((a, b) => order(a[0]) - order(b[0]))
      .map(([key, list]) => ({
        key,
        stage: key === 'none' ? null : (lookups.stage.get(Number(key)) ?? null),
        tasks: list,
        all: allByStage.get(key) ?? list,
      }));
  }, [visible, tasks, lookups.stage]);

  const canDrag = filters.sort === null;
  const toggleSort = (key: SortKey) => {
    if (filters.sort !== key) setFilters({ sort: key, dir: 'asc' });
    else if (filters.dir === 'asc') setFilters({ sort: key, dir: 'desc' });
    else setFilters({ sort: null, dir: 'asc' });
  };

  const onDrop = (target: TaskDTO) => {
    if (dragId === null || dragId === target.id) return;
    const all = [...tasks].sort((a, b) => a.order - b.order || a.id - b.id);
    const dragged = all.find((t) => t.id === dragId);
    if (!dragged) return;
    const rest = all.filter((t) => t.id !== dragId);
    const idx = rest.findIndex((t) => t.id === target.id);
    const draggedIdx = all.findIndex((t) => t.id === dragId);
    const targetIdx = all.findIndex((t) => t.id === target.id);
    rest.splice(draggedIdx < targetIdx ? idx + 1 : idx, 0, dragged);
    void reorder(rest.map((t) => t.id));
    if (dragged.stageId !== target.stageId)
      void patchTask(dragged.id, { stageId: target.stageId }, { silent: true });
  };

  const allSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));

  return (
    <>
      {selected.size > 0 && <BulkBar ids={[...selected]} onClear={() => setSelected(new Set())} />}
      <div
        className="thin-scroll overflow-x-auto rounded-md border border-line"
        data-testid="task-table"
      >
        <table className="w-full min-w-[1400px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-ink/70">
            <tr>
              <th className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  className="accent-brand"
                  aria-label="Выбрать все"
                  checked={allSelected}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(visible.map((t) => t.id)) : new Set())
                  }
                />
              </th>
              <th className="w-6" />
              {COLUMNS.map((c) => (
                <th key={c.key} className={cn('px-2 py-2 font-medium', c.className)}>
                  {c.sort ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-brand"
                      onClick={() => toggleSort(c.sort!)}
                    >
                      {c.label}
                      {filters.sort === c.sort ? (
                        filters.dir === 'asc' ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          {groups.length === 0 && (
            <tbody>
              <tr>
                <td
                  colSpan={COLUMNS.length + 3}
                  className="px-3 py-10 text-center text-status-gray"
                >
                  {tasks.length
                    ? 'Нет задач, подходящих под фильтры'
                    : 'В плане пока нет задач. Добавьте задачу или загрузите план из Excel.'}
                </td>
              </tr>
            </tbody>
          )}
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.key);
            const done = g.all.filter((t) => t.status === 'DONE').length;
            const pct = g.all.length ? Math.round((done / g.all.length) * 100) : 0;
            const color = g.stage?.color ?? '#8A94A6';
            return (
              <tbody key={g.key}>
                <tr className="border-t border-line bg-white">
                  <td colSpan={COLUMNS.length + 3} className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsed((s) => {
                          const n = new Set(s);
                          if (n.has(g.key)) n.delete(g.key);
                          else n.add(g.key);
                          return n;
                        })
                      }
                      className="flex w-full items-center gap-2 text-left"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                      <span className="h-4 w-1.5 rounded-sm" style={{ background: color }} />
                      <span className="font-semibold">{g.stage?.name ?? 'Без этапа'}</span>
                      <span className="text-xs text-ink/60">
                        {g.tasks.length !== g.all.length
                          ? `${g.tasks.length} из ${g.all.length}`
                          : g.all.length}{' '}
                        {pluralRu(g.all.length, 'задача', 'задачи', 'задач')}
                      </span>
                      <span className="ml-3 h-1.5 w-32 overflow-hidden rounded-full bg-surface">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${pct}%`, background: TONE_COLOR.green }}
                        />
                      </span>
                      <span className="text-xs text-ink/70">{pct}% выполнено</span>
                    </button>
                  </td>
                </tr>
                {!isCollapsed &&
                  g.tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      selected={selected.has(t.id)}
                      onSelect={(v) =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (v) n.add(t.id);
                          else n.delete(t.id);
                          return n;
                        })
                      }
                      canDrag={canDrag}
                      isDropTarget={dropTarget === t.id && dragId !== t.id}
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropTarget(null);
                      }}
                      onDragOver={() => setDropTarget(t.id)}
                      onDrop={() => onDrop(t)}
                    />
                  ))}
              </tbody>
            );
          })}
        </table>
      </div>
      {!canDrag && (
        <p className="mt-2 text-xs text-ink/60">
          Перетаскивание строк доступно без сортировки (порядок по умолчанию).
        </p>
      )}
      {dicts.stages.length === 0 && null}
    </>
  );
}

const TaskRow = React.memo(function TaskRow({
  task: t,
  selected,
  onSelect,
  canDrag,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  task: TaskDTO;
  selected: boolean;
  onSelect: (v: boolean) => void;
  canDrag: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  const { today, lookups, filters, patchTask, setOpenTaskId, duplicate, removeTasks } = useForum();
  const confirm = useConfirm();
  const overdue = isOverdue(t, today);
  const lag = lagDays(t, today);
  const startWarn = shouldStart(t, today) && !overdue;

  return (
    <tr
      data-testid="task-row"
      data-task-id={t.id}
      className={cn(
        'group border-t border-line align-top',
        overdue ? 'bg-red-50 hover:bg-red-100/60' : 'hover:bg-surface/60',
        selected && 'bg-brand-light',
        isDropTarget && 'outline outline-2 -outline-offset-2 outline-brand',
      )}
      onDragOver={(e) => {
        if (!canDrag) return;
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <td className="px-2 py-2">
        <input
          type="checkbox"
          className="accent-brand"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={`Выбрать задачу ${t.number}`}
        />
      </td>
      <td className="py-2">
        <span
          draggable={canDrag}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(t.id));
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          className={cn(
            'block text-status-gray',
            canDrag ? 'cursor-grab hover:text-ink' : 'opacity-30',
          )}
          title={canDrag ? 'Перетащите, чтобы изменить порядок' : undefined}
        >
          <GripVertical className="size-4" />
        </span>
      </td>
      <td className="px-2 py-2 tabular-nums text-ink/70">{t.number}</td>
      <td className="px-2 py-2 text-xs">{t.blockId ? lookups.block.get(t.blockId) : ''}</td>
      <td className="px-1 py-1.5">
        <TextCell
          value={t.description}
          required
          onSave={(v) => patchTask(t.id, { description: v })}
        >
          <Highlight text={t.description} query={filters.q} />
        </TextCell>
      </td>
      <td className="px-1 py-1.5 text-xs">
        <TextCell
          value={t.termText}
          multiline={false}
          onSave={(v) => patchTask(t.id, { termText: v })}
        >
          {t.termText || <span className="text-status-gray">—</span>}
          {t.needsClarification && (
            <span className="mt-1 block w-fit rounded bg-yellow-100 px-1.5 py-0.5 text-[11px] font-medium text-yellow-800">
              уточнить срок
            </span>
          )}
        </TextCell>
      </td>
      <td className="px-1 py-1.5 text-xs">
        <DateCell
          task={t}
          field="startDate"
          warn={
            startWarn ? (
              <AlertTriangle className="size-3.5 text-status-red" aria-label="Пора начинать" />
            ) : null
          }
        />
        {startWarn && <span className="block px-1 text-[11px] text-status-red">пора начинать</span>}
      </td>
      <td className="px-1 py-1.5 text-xs">
        <DateCell task={t} field="endDate" />
      </td>
      <td className="px-2 py-2 text-xs">{t.roleIds.map((r) => lookups.role.get(r)).join(' / ')}</td>
      <td className="px-1 py-1 text-xs">
        <EmployeesCell task={t} />
      </td>
      <td className="px-2 py-2">
        <StatusCell task={t} today={today} />
      </td>
      <td className="px-2 py-2 text-xs">
        {lag > 0 ? (
          <span className="font-semibold text-status-red">+{lag} дн.</span>
        ) : (
          <span className="text-status-gray">—</span>
        )}
      </td>
      <td className="px-1 py-1.5 text-xs">
        <TextCell value={t.comment ?? ''} onSave={(v) => patchTask(t.id, { comment: v })}>
          {t.comment ? (
            <Highlight text={t.comment} query={filters.q} />
          ) : (
            <span className="text-status-gray">—</span>
          )}
        </TextCell>
      </td>
      <td className="px-1 py-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded p-1 text-status-gray hover:bg-white hover:text-ink"
            aria-label="Действия с задачей"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setOpenTaskId(t.id)}>
              <PanelRightOpen /> Открыть карточку
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => duplicate(t.id)}>
              <Copy /> Дублировать
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              danger
              onSelect={async () => {
                const ok = await confirm({
                  title: `Удалить задачу №${t.number}?`,
                  description: t.description,
                  confirmText: 'Удалить',
                  danger: true,
                });
                if (ok) await removeTasks([t.id]);
              }}
            >
              <Trash2 /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
});
