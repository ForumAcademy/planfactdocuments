'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, Copy, History, RefreshCw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea, Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { MultiSelect } from '@/components/ui/multi-select';
import { StatusBadge } from '@/components/ui/status-badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import {
  STATUS_LABEL,
  TASK_STATUSES,
  lagDays,
  shouldStart,
  type TaskStatusCode,
} from '@/lib/status';
import type { HistoryDTO, TaskDTO } from '@/lib/types';
import { getTaskHistory } from '@/server/actions/tasks';
import { useForum } from './forum-context';

/** Боковая панель редактирования задачи. */
export function TaskPanel() {
  const { openTaskId, setOpenTaskId, tasks } = useForum();
  const task = tasks.find((t) => t.id === openTaskId) ?? null;
  return (
    <DialogPrimitive.Root open={task !== null} onOpenChange={(o) => !o && setOpenTaskId(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-xl focus:outline-none"
          data-testid="task-panel"
        >
          {task && <PanelBody key={task.id} task={task} onClose={() => setOpenTaskId(null)} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PanelBody({ task, onClose }: { task: TaskDTO; onClose: () => void }) {
  const { patchTask, dicts, today, duplicate, removeTasks } = useForum();
  const confirm = useConfirm();
  const [description, setDescription] = React.useState(task.description);
  const [termText, setTermText] = React.useState(task.termText);
  const [comment, setComment] = React.useState(task.comment ?? '');
  const [history, setHistory] = React.useState<HistoryDTO[] | null>(null);

  React.useEffect(() => setDescription(task.description), [task.description]);
  React.useEffect(() => setTermText(task.termText), [task.termText]);
  React.useEffect(() => setComment(task.comment ?? ''), [task.comment]);

  const loadHistory = React.useCallback(async () => {
    const res = await getTaskHistory(task.id);
    setHistory(res.ok ? res.data : []);
  }, [task.id]);
  React.useEffect(() => {
    void loadHistory();
  }, [loadHistory, task]);

  const save = (patch: Parameters<typeof patchTask>[1]) => void patchTask(task.id, patch);
  const lag = lagDays(task, today);

  return (
    <>
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="text-lg font-semibold">
            Задача №{task.number}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge task={task} today={today} />
            {lag > 0 && (
              <span className="font-semibold text-status-red">Отставание +{lag} дн.</span>
            )}
            {shouldStart(task, today) && (
              <span className="inline-flex items-center gap-1 text-status-red">
                <AlertTriangle className="size-3.5" /> пора начинать
              </span>
            )}
          </DialogPrimitive.Description>
        </div>
        <DialogPrimitive.Close
          className="rounded p-1 text-status-gray hover:bg-surface hover:text-ink"
          aria-label="Закрыть"
        >
          <X className="size-5" />
        </DialogPrimitive.Close>
      </div>

      <div className="thin-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <Field label="Описание задачи">
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() =>
              description.trim() &&
              description.trim() !== task.description &&
              save({ description: description.trim() })
            }
            data-testid="panel-description"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Статус">
            <Select
              value={task.status}
              onChange={(e) => save({ status: e.target.value as TaskStatusCode })}
              data-testid="panel-status"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          {task.status === 'DONE' && (
            <Field label="Дата выполнения">
              <DateInput
                value={task.completedAt}
                clearable={false}
                onChange={(v) => v && save({ completedAt: v })}
              />
            </Field>
          )}
          <Field label="Этап">
            <Select
              value={task.stageId ?? ''}
              onChange={(e) => save({ stageId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">— без этапа —</option>
              {dicts.stages
                .filter((s) => !s.archived || s.id === task.stageId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Блок / направление">
            <Select
              value={task.blockId ?? ''}
              onChange={(e) => save({ blockId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">— без блока —</option>
              {dicts.blocks
                .filter((s) => !s.archived || s.id === task.blockId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Срок (исходный текст)"
          hint={
            task.datesManual
              ? 'Даты изменены вручную и не пересчитываются автоматически'
              : 'Даты вычисляются по тексту срока'
          }
        >
          <div className="flex gap-2">
            <Input
              value={termText}
              onChange={(e) => setTermText(e.target.value)}
              onBlur={() =>
                termText.trim() !== task.termText && save({ termText: termText.trim() })
              }
            />
            <Button
              variant="outline"
              title="Пересчитать даты по тексту срока"
              onClick={() => save({ termText: termText.trim(), recalc: true })}
            >
              <RefreshCw /> Пересчитать
            </Button>
          </div>
          {task.needsClarification && (
            <p className="mt-1 inline-block rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800">
              Срок не распознан — уточнить срок
            </p>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Дата начала">
            <DateInput value={task.startDate} onChange={(v) => save({ startDate: v })} />
          </Field>
          <Field label="Дата окончания (срок)">
            <DateInput
              value={task.endDate}
              min={task.startDate}
              onChange={(v) => save({ endDate: v })}
            />
          </Field>
        </div>

        <Field label="Роли">
          <MultiSelect
            options={dicts.roles
              .filter((r) => !r.archived || task.roleIds.includes(r.id))
              .map((r) => ({ value: String(r.id), label: r.name }))}
            value={task.roleIds.map(String)}
            onChange={(v) => save({ roleIds: v.map(Number) })}
          />
        </Field>
        <Field label="Ответственные">
          <MultiSelect
            options={dicts.employees
              .filter((e) => e.active || task.employeeIds.includes(e.id))
              .map((e) => ({
                value: String(e.id),
                label: e.fullName,
                hint: e.position ?? undefined,
              }))}
            value={task.employeeIds.map(String)}
            onChange={(v) => save({ employeeIds: v.map(Number) })}
            placeholder="Выберите из справочника"
          />
          <div
            className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/60"
            data-testid="assign-mode"
          >
            {task.employeesManual ? (
              <>
                <span>Изменены вручную.</span>
                <button
                  type="button"
                  className="text-brand hover:underline"
                  onClick={() => save({ autoAssign: true })}
                >
                  Назначать автоматически по ролям
                </button>
              </>
            ) : (
              <span>Назначаются автоматически по ролям задачи — можно изменить вручную.</span>
            )}
          </div>
        </Field>
        <Field label="Комментарий">
          <Textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onBlur={() => comment.trim() !== (task.comment ?? '') && save({ comment })}
          />
        </Field>

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <History className="size-4" /> История изменений
          </h3>
          {history === null ? (
            <Spinner label="Загрузка…" />
          ) : history.length === 0 ? (
            <p className="text-sm text-status-gray">Изменений пока нет</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {history.map((h) => (
                <li key={h.id} className="rounded bg-surface px-2 py-1.5">
                  <div className="text-ink/60">
                    {new Date(h.changedAt).toLocaleString('ru-RU', {
                      timeZone: 'Europe/Moscow',
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}{' '}
                    · {h.changedBy}
                  </div>
                  <div>
                    <b>{h.field}</b>
                    {h.oldValue !== null || h.newValue !== null ? ': ' : ''}
                    {h.oldValue !== null && (
                      <span className="text-ink/60 line-through">{h.oldValue || '—'}</span>
                    )}
                    {h.oldValue !== null && ' → '}
                    {h.newValue !== null && <span>{h.newValue || '—'}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t border-line px-5 py-3">
        <Button variant="outline" onClick={() => duplicate(task.id)}>
          <Copy /> Дублировать
        </Button>
        <Button
          variant="outline"
          className="text-status-red"
          onClick={async () => {
            const ok = await confirm({
              title: `Удалить задачу №${task.number}?`,
              description: task.description,
              confirmText: 'Удалить',
              danger: true,
            });
            if (ok && (await removeTasks([task.id]))) onClose();
          }}
        >
          <Trash2 /> Удалить
        </Button>
        <Button className="ml-auto" onClick={onClose}>
          Готово
        </Button>
      </div>
    </>
  );
}
