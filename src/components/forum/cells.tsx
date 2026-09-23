'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MultiSelect } from '@/components/ui/multi-select';
import { DateInput } from '@/components/ui/date-input';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate, type ISODate } from '@/lib/dates';
import { STATUS_LABEL, TASK_STATUSES, TONE_COLOR, type TaskStatusCode } from '@/lib/status';
import type { TaskDTO } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useForum } from './forum-context';

/** Статус — выпадающий список. */
export function StatusCell({ task, today }: { task: TaskDTO; today: ISODate }) {
  const { patchTask } = useForum();
  const [open, setOpen] = React.useState(false);
  const choose = (s: TaskStatusCode) => {
    setOpen(false);
    if (s !== task.status) void patchTask(task.id, { status: s });
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 rounded hover:opacity-90"
          aria-label="Изменить статус"
          data-testid="status-cell"
        >
          <StatusBadge task={task} today={today} />
          <ChevronDown className="size-3 text-status-gray" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1">
        {TASK_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => choose(s)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface"
          >
            <span
              className="size-2.5 rounded-full"
              style={{
                background:
                  TONE_COLOR[s === 'DONE' ? 'blue' : s === 'IN_PROGRESS' ? 'green' : 'gray'],
              }}
            />
            <span className="flex-1">{STATUS_LABEL[s]}</span>
            {task.status === s && <Check className="size-3.5 text-brand" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Ответственные — выбор из справочника с поиском. */
export function EmployeesCell({ task }: { task: TaskDTO }) {
  const { patchTask, dicts, lookups } = useForum();
  const options = React.useMemo(
    () =>
      dicts.employees
        .filter((e) => e.active || task.employeeIds.includes(e.id))
        .map((e) => ({
          value: String(e.id),
          label: e.fullName,
          hint:
            e.roleIds
              .map((r) => lookups.role.get(r))
              .filter(Boolean)
              .join(', ') ||
            e.position ||
            undefined,
        })),
    [dicts.employees, task.employeeIds, lookups.role],
  );
  const [draft, setDraft] = React.useState<string[] | null>(null);
  return (
    <div onBlur={() => undefined} className="min-w-[150px]" onKeyDown={(e) => e.stopPropagation()}>
      <MultiSelect
        compact
        ariaLabel="Ответственные"
        placeholder="Назначить…"
        className="border-transparent bg-transparent text-xs hover:border-line"
        options={options}
        value={draft ?? task.employeeIds.map(String)}
        onChange={(v) => {
          setDraft(v);
          void patchTask(task.id, { employeeIds: v.map(Number) }).then(() => setDraft(null));
        }}
      />
    </div>
  );
}

/** Дата — текст, по клику календарь. */
export function DateCell({
  task,
  field,
  warn,
}: {
  task: TaskDTO;
  field: 'startDate' | 'endDate';
  warn?: React.ReactNode;
}) {
  const { patchTask } = useForum();
  const [editing, setEditing] = React.useState(false);
  const value = task[field];
  if (editing) {
    return (
      <DateInput
        compact
        autoFocus
        className="w-[122px]"
        value={value}
        min={field === 'endDate' ? task.startDate : null}
        onChange={(v) => {
          setEditing(false);
          if (v !== value) void patchTask(task.id, { [field]: v });
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1 py-0.5 tabular-nums hover:bg-brand-light"
      title="Изменить дату"
    >
      {formatDate(value) || <span className="text-status-gray">—</span>}
      {warn}
    </button>
  );
}

/** Текст — редактирование по двойному клику. */
export function TextCell({
  value,
  onSave,
  children,
  multiline = true,
  required,
  className,
  placeholder = '—',
}: {
  value: string;
  onSave: (v: string) => void;
  children?: React.ReactNode;
  multiline?: boolean;
  required?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (required && !v) return setDraft(value);
    if (v !== value.trim()) onSave(v);
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        rows={multiline ? Math.min(6, Math.max(2, Math.ceil(draft.length / 45))) : 1}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
          if (e.key === 'Enter' && (!multiline || !e.shiftKey)) {
            e.preventDefault();
            commit();
          }
        }}
        className="w-full min-w-[160px] rounded border border-brand bg-white px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
    );
  }
  return (
    <div
      onDoubleClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="Двойной клик — редактировать"
      className={cn(
        'cursor-text whitespace-pre-line rounded px-1 py-0.5 hover:bg-brand-light/60',
        className,
      )}
    >
      {children ?? (value || <span className="text-status-gray">{placeholder}</span>)}
    </div>
  );
}
