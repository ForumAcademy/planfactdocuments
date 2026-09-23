'use client';

import * as React from 'react';
import { Search, X, RotateCcw } from 'lucide-react';
import { MultiSelect } from '@/components/ui/multi-select';
import { DateInput } from '@/components/ui/date-input';
import { Button } from '@/components/ui/button';
import { hasActiveFilters, type DueFilter } from '@/lib/filters';
import { STATUS_LABEL, TASK_STATUSES } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useForum } from './forum-context';

const DUE_BUTTONS: { key: DueFilter; label: string }[] = [
  { key: 'overdue', label: 'Просрочено' },
  { key: 'week', label: 'На этой неделе' },
  { key: '14d', label: 'В ближайшие 14 дней' },
  { key: 'nodate', label: 'Без даты' },
];

/** Общая панель фильтров для вкладок Ганта и списка. Состояние — в URL. */
export function FilterBar({ className }: { className?: string }) {
  const { filters, setFilters, resetFilters, dicts, tasks, visible } = useForum();
  const [q, setQ] = React.useState(filters.q);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => setQ(filters.q), [filters.q]);

  const onSearch = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFilters({ q: v }), 250);
  };

  const used = React.useMemo(() => {
    const roles = new Set<number>();
    const emps = new Set<number>();
    const blocks = new Set<number>();
    for (const t of tasks) {
      t.roleIds.forEach((r) => roles.add(r));
      t.employeeIds.forEach((e) => emps.add(e));
      if (t.blockId) blocks.add(t.blockId);
    }
    return { roles, emps, blocks };
  }, [tasks]);

  const opt = <T extends { id: number; archived?: boolean }>(
    list: T[],
    label: (x: T) => string,
    selected: number[],
    usedSet?: Set<number>,
    color?: (x: T) => string,
  ) =>
    list
      .filter((x) => !x.archived || selected.includes(x.id) || usedSet?.has(x.id))
      .map((x) => ({ value: String(x.id), label: label(x), color: color?.(x) }));

  const active = hasActiveFilters(filters);

  return (
    <div
      className={cn('rounded-md border border-line bg-surface p-2.5', className)}
      data-testid="filter-bar"
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <div className="relative col-span-2 md:col-span-3 xl:col-span-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-status-gray" />
          <input
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Поиск по задачам…"
            aria-label="Поиск по задачам"
            className="h-9 w-full rounded-md border border-line bg-white pl-8 pr-8 text-sm focus:border-brand focus:outline-none"
          />
          {q && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-status-gray hover:text-ink"
              onClick={() => onSearch('')}
              aria-label="Очистить поиск"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <MultiSelect
          ariaLabel="Этап"
          placeholder="Этап"
          options={opt(
            dicts.stages,
            (s) => s.name,
            filters.stage,
            undefined,
            (s) => s.color,
          )}
          value={filters.stage.map(String)}
          onChange={(v) => setFilters({ stage: v.map(Number) })}
        />
        <MultiSelect
          ariaLabel="Блок"
          placeholder="Блок"
          options={opt(dicts.blocks, (s) => s.name, filters.block, used.blocks)}
          value={filters.block.map(String)}
          onChange={(v) => setFilters({ block: v.map(Number) })}
        />
        <MultiSelect
          ariaLabel="Роль"
          placeholder="Роль"
          options={opt(dicts.roles, (s) => s.name, filters.role, used.roles)}
          value={filters.role.map(String)}
          onChange={(v) => setFilters({ role: v.map(Number) })}
        />
        <MultiSelect
          ariaLabel="Ответственный"
          placeholder="Ответственный"
          options={dicts.employees
            .filter((e) => e.active || used.emps.has(e.id) || filters.emp.includes(e.id))
            .map((e) => ({
              value: String(e.id),
              label: e.fullName,
              hint: e.position ?? undefined,
            }))}
          value={filters.emp.map(String)}
          onChange={(v) => setFilters({ emp: v.map(Number) })}
        />
        <MultiSelect
          ariaLabel="Статус"
          placeholder="Статус"
          searchable={false}
          options={TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          value={filters.status}
          onChange={(v) => setFilters({ status: v as typeof filters.status })}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink/70">Срок:</span>
        {DUE_BUTTONS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setFilters({ due: filters.due === b.key ? null : b.key })}
            className={cn(
              'h-8 rounded-md border px-2.5 text-xs',
              filters.due === b.key
                ? b.key === 'overdue'
                  ? 'border-status-red bg-status-red text-white'
                  : 'border-brand bg-brand text-white'
                : 'border-line bg-white hover:border-brand/50',
            )}
          >
            {b.label}
          </button>
        ))}
        <span className="ml-1 text-ink/70">с</span>
        <DateInput
          compact
          className="w-32"
          value={filters.from}
          onChange={(v) => setFilters({ from: v })}
          ariaLabel="Срок с"
        />
        <span className="text-ink/70">по</span>
        <DateInput
          compact
          className="w-32"
          value={filters.to}
          onChange={(v) => setFilters({ to: v })}
          ariaLabel="Срок по"
        />
        <span className="ml-auto text-xs text-ink/70">
          Показано {visible.length} из {tasks.length}
        </span>
        <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!active}>
          <RotateCcw /> Сбросить фильтры
        </Button>
      </div>
    </div>
  );
}
