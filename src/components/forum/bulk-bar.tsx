'use client';

import * as React from 'react';
import { CalendarClock, Trash2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { STATUS_LABEL, TASK_STATUSES, type TaskStatusCode } from '@/lib/status';
import { pluralRu } from '@/lib/utils';
import { useForum } from './forum-context';

/** Массовые действия над выбранными строками. */
export function BulkBar({ ids, onClear }: { ids: number[]; onClear: () => void }) {
  const { bulkUpdate, removeTasks, dicts } = useForum();
  const confirm = useConfirm();
  const [emps, setEmps] = React.useState<string[]>([]);
  const [empMode, setEmpMode] = React.useState<'set' | 'add'>('add');
  const [shift, setShift] = React.useState('7');
  const [empOpen, setEmpOpen] = React.useState(false);
  const [shiftOpen, setShiftOpen] = React.useState(false);

  return (
    <div
      className="sticky top-14 z-20 mb-2 flex flex-wrap items-center gap-2 rounded-md border border-brand/40 bg-brand-light px-3 py-2 text-sm shadow-sm"
      data-testid="bulk-bar"
    >
      <span className="font-medium">
        Выбрано {ids.length} {pluralRu(ids.length, 'задача', 'задачи', 'задач')}
      </span>
      <Select
        className="w-48"
        value=""
        aria-label="Сменить статус"
        onChange={async (e) => {
          const s = e.target.value as TaskStatusCode;
          if (s) await bulkUpdate(ids, { status: s });
        }}
      >
        <option value="">Сменить статус…</option>
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </Select>

      <Popover open={empOpen} onOpenChange={setEmpOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <UserPlus /> Ответственный…
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-2 p-3">
          <MultiSelect
            options={dicts.employees
              .filter((e) => e.active)
              .map((e) => ({ value: String(e.id), label: e.fullName }))}
            value={emps}
            onChange={setEmps}
            placeholder="Выберите сотрудников"
          />
          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                className="accent-brand"
                checked={empMode === 'add'}
                onChange={() => setEmpMode('add')}
              />{' '}
              добавить к текущим
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                className="accent-brand"
                checked={empMode === 'set'}
                onChange={() => setEmpMode('set')}
              />{' '}
              заменить
            </label>
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={!emps.length && empMode === 'add'}
            onClick={async () => {
              if (await bulkUpdate(ids, { employeeIds: emps.map(Number), employeeMode: empMode })) {
                setEmpOpen(false);
                setEmps([]);
              }
            }}
          >
            Применить
          </Button>
          <div className="border-t border-line pt-2">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={async () => {
                if (await bulkUpdate(ids, { autoAssign: true })) setEmpOpen(false);
              }}
              data-testid="bulk-auto-assign"
            >
              Назначить автоматически по ролям
            </Button>
            <p className="mt-1 text-xs text-ink/60">
              Ответственными станут сотрудники с ролями задачи; дальше они будут обновляться сами.
            </p>
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={shiftOpen} onOpenChange={setShiftOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <CalendarClock /> Сдвинуть сроки…
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-2 p-3">
          <label className="block text-xs">
            Сдвинуть даты начала и окончания на N дней (минус — раньше):
            <input
              type="number"
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              className="mt-1 h-8 w-full rounded border border-line px-2 text-sm"
            />
          </label>
          <Button
            size="sm"
            className="w-full"
            onClick={async () => {
              const n = Number(shift);
              if (!Number.isInteger(n) || n === 0) return;
              if (await bulkUpdate(ids, { shiftDays: n })) setShiftOpen(false);
            }}
          >
            Сдвинуть
          </Button>
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="sm"
        className="text-status-red"
        onClick={async () => {
          const ok = await confirm({
            title: `Удалить ${ids.length} ${pluralRu(ids.length, 'задачу', 'задачи', 'задач')}?`,
            description: 'Действие нельзя отменить.',
            confirmText: 'Удалить',
            danger: true,
          });
          if (ok && (await removeTasks(ids))) onClear();
        }}
      >
        <Trash2 /> Удалить
      </Button>
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
        <X /> Снять выделение
      </Button>
    </div>
  );
}
