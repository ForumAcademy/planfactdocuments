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
import { useForum } from './forum-context';
import { Highlight } from './highlight';

const HEAD: Record<TaskStatusCode, string> = {
  NOT_STARTED: TONE_COLOR.gray,
  IN_PROGRESS: TONE_COLOR.blue,
  DONE: TONE_COLOR.green,
};

/** Вид «По статусам»: три колонки, карточки перетаскиваются между ними. */
export function KanbanView() {
  const { visible, today, lookups, patchTask, setOpenTaskId, filters } = useForum();
  const [over, setOver] = React.useState<TaskStatusCode | null>(null);
  const [dragId, setDragId] = React.useState<number | null>(null);
  const [limit, setLimit] = React.useState<Record<TaskStatusCode, number>>({
    NOT_STARTED: 60,
    IN_PROGRESS: 60,
    DONE: 60,
  });

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3" data-testid="kanban">
      {TASK_STATUSES.map((s) => {
        const list = visible.filter((t) => t.status === s);
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
              {list.slice(0, limit[s]).map((t) => {
                const overdue = isOverdue(t, today);
                const lag = lagDays(t, today);
                return (
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
                      {t.stageId && (
                        <span className="inline-flex items-center gap-1">
                          <span
                            className="size-2 rounded-sm"
                            style={{ background: lookups.stage.get(t.stageId)?.color }}
                          />
                          {lookups.stage.get(t.stageId)?.name}
                        </span>
                      )}
                    </div>
                    <div className="leading-snug">
                      <Highlight text={t.description} query={filters.q} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/70">
                      {t.blockId && <span>{lookups.block.get(t.blockId)}</span>}
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3" /> {formatDate(t.endDate) || '—'}
                      </span>
                      {lag > 0 && <span className="font-semibold text-status-red">+{lag} дн.</span>}
                      {shouldStart(t, today) && !overdue && (
                        <span className="inline-flex items-center gap-1 text-status-red">
                          <AlertTriangle className="size-3" /> пора начинать
                        </span>
                      )}
                      {t.needsClarification && (
                        <span className="rounded bg-yellow-100 px-1 text-yellow-800">
                          уточнить срок
                        </span>
                      )}
                    </div>
                    {t.employeeIds.length > 0 && (
                      <div className="mt-1.5 text-xs text-ink/80">
                        {t.employeeIds.map((e) => lookups.employee.get(e)?.fullName).join(', ')}
                      </div>
                    )}
                  </div>
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
  );
}
