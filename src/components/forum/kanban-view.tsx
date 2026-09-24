'use client';

import * as React from 'react';
import { AlertTriangle, CalendarDays } from 'lucide-react';
import { formatDate } from '@/lib/dates';
import {
  STATUS_LABEL,
  TASK_STATUSES,
  TONE_COLOR,
  isOverdue,
  lagDays,
  shouldStart,
  type TaskStatusCode,
} from '@/lib/status';
import { cn } from '@/lib/utils';
import { filterTasks } from '@/lib/filters';
import { useForum } from './forum-context';
import { Highlight } from './highlight';

const HEAD: Record<TaskStatusCode, string> = {
  NOT_STARTED: TONE_COLOR.gray,
  IN_PROGRESS: TONE_COLOR.blue,
  DONE: TONE_COLOR.green,
};

/** Вид «По статусам»: три колонки, карточки перетаскиваются между ними. */
export function KanbanView() {
  const { visible, tasks, today, lookups, patchTask, setOpenTaskId, filters, setFilters, dicts } =
    useForum();
  const [over, setOver] = React.useState<TaskStatusCode | null>(null);
  const [dragId, setDragId] = React.useState<number | null>(null);
  const [limit, setLimit] = React.useState<Record<TaskStatusCode, number>>({
    NOT_STARTED: 60,
    IN_PROGRESS: 60,
    DONE: 60,
  });

  // Счётчики для кнопок этапов — с учётом всех фильтров, кроме самого этапа
  const stageCounts = React.useMemo(() => {
    const m = new Map<number | null, number>();
    for (const t of filterTasks(tasks, { ...filters, stage: [] }, today)) {
      m.set(t.stageId, (m.get(t.stageId) ?? 0) + 1);
    }
    return m;
  }, [tasks, filters, today]);
  const totalAll = [...stageCounts.values()].reduce((a, b) => a + b, 0);
  const oneStage = filters.stage.length === 1 ? filters.stage[0] : null;
  const stageOrder = (id: number | null) => (id ? (lookups.stage.get(id)?.order ?? 1e8) : 1e9);

  return (
    <div>
      <div
        className="mb-3 flex flex-wrap gap-2"
        role="group"
        aria-label="Этап"
        data-testid="kanban-stages"
      >
        <StageChip
          active={filters.stage.length === 0}
          onClick={() => setFilters({ stage: [] })}
          label="Все этапы"
          count={totalAll}
        />
        {dicts.stages
          .filter((st) => stageCounts.has(st.id) || filters.stage.includes(st.id))
          .map((st) => (
            <StageChip
              key={st.id}
              active={oneStage === st.id}
              onClick={() => setFilters({ stage: oneStage === st.id ? [] : [st.id] })}
              label={st.name}
              color={st.color}
              count={stageCounts.get(st.id) ?? 0}
            />
          ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3" data-testid="kanban">
        {TASK_STATUSES.map((s) => {
          const list = visible
            .filter((t) => t.status === s)
            .sort((a, b) => stageOrder(a.stageId) - stageOrder(b.stageId) || a.order - b.order);
          const grouped = oneStage === null;
          return (
            <div
              key={s}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(s);
              }}
              onDragLeave={() => setOver((o) => (o === s ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = Number(e.dataTransfer.getData('text/plain')) || dragId;
                const t = visible.find((x) => x.id === id);
                if (t && t.status !== s) void patchTask(t.id, { status: s });
                setDragId(null);
              }}
              className={cn(
                'flex min-h-[300px] flex-col rounded-md border bg-surface',
                over === s ? 'border-brand ring-2 ring-brand/20' : 'border-line',
              )}
              data-testid={`kanban-${s}`}
            >
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <span className="size-2.5 rounded-full" style={{ background: HEAD[s] }} />
                <span className="font-semibold">{STATUS_LABEL[s]}</span>
                <span className="ml-auto rounded bg-white px-1.5 text-xs text-ink/70">
                  {list.length}
                </span>
              </div>
              <div className="thin-scroll flex max-h-[70vh] flex-1 flex-col gap-2 overflow-y-auto p-2">
                {list.slice(0, limit[s]).map((t, k, arr) => {
                  const overdue = isOverdue(t, today);
                  const lag = lagDays(t, today);
                  const newGroup = grouped && (k === 0 || arr[k - 1].stageId !== t.stageId);
                  return (
                    <React.Fragment key={t.id}>
                      {newGroup && (
                        <div className="mt-1 flex items-center gap-1.5 px-1 text-xs font-semibold text-ink/70 first:mt-0">
                          <span
                            className="size-2 rounded-sm"
                            style={{
                              background: t.stageId
                                ? lookups.stage.get(t.stageId)?.color
                                : '#8A94A6',
                            }}
                          />
                          {t.stageId ? lookups.stage.get(t.stageId)?.name : 'Без этапа'}
                          <span className="font-normal text-ink/50">
                            {list.filter((x) => x.stageId === t.stageId).length}
                          </span>
                        </div>
                      )}
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(t.id));
                          setDragId(t.id);
                        }}
                        onClick={() => setOpenTaskId(t.id)}
                        className={cn(
                          'cursor-grab rounded-md border bg-white p-2.5 text-sm shadow-sm hover:border-brand/50 active:cursor-grabbing',
                          overdue ? 'border-status-red/40 bg-red-50' : 'border-line',
                          dragId === t.id && 'opacity-50',
                        )}
                        data-testid="kanban-card"
                      >
                        <div className="mb-1 flex items-center gap-2 text-[11px] text-ink/60">
                          <span>№{t.number}</span>
                        </div>
                        <div className="leading-snug">
                          <Highlight text={t.description} query={filters.q} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/70">
                          {t.blockId && <span>{lookups.block.get(t.blockId)}</span>}
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="size-3" /> {formatDate(t.endDate) || '—'}
                          </span>
                          {lag > 0 && (
                            <span className="font-semibold text-status-red">+{lag} дн.</span>
                          )}
                          {shouldStart(t, today) && !overdue && (
                            <span className="inline-flex items-center gap-1 text-status-red">
                              <AlertTriangle className="size-3" /> пора начинать
                            </span>
                          )}
                          {t.needsClarification && (
                            <span
                              className="rounded bg-yellow-100 px-1 text-yellow-800"
                              title="Срок в тексте не распознан — даты поставлены на весь этап. Проверьте даты или впишите срок понятнее, например «за 2 недели до форума» или «до 15.10.2026»."
                            >
                              примерный срок
                            </span>
                          )}
                        </div>
                        {t.employeeIds.length > 0 && (
                          <div className="mt-1.5 text-xs text-ink/80">
                            {t.employeeIds.map((e) => lookups.employee.get(e)?.fullName).join(', ')}
                          </div>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
                {list.length > limit[s] && (
                  <button
                    type="button"
                    className="rounded py-2 text-xs text-brand hover:bg-white"
                    onClick={() => setLimit((l) => ({ ...l, [s]: l[s] + 100 }))}
                  >
                    Показать ещё ({list.length - limit[s]})
                  </button>
                )}
                {list.length === 0 && (
                  <div className="py-8 text-center text-xs text-status-gray">
                    Перетащите сюда карточку
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StageChip({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm',
        active ? 'border-brand bg-brand text-white' : 'border-line bg-white hover:border-brand/50',
      )}
    >
      {color && <span className="size-2.5 rounded-sm" style={{ background: color }} />}
      {label}
      <span
        className={cn(
          'rounded px-1.5 text-xs tabular-nums',
          active ? 'bg-white/20' : 'bg-surface text-ink/70',
        )}
      >
        {count}
      </span>
    </button>
  );
}
