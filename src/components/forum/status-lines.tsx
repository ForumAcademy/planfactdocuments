'use client';

import * as React from 'react';
import Link from 'next/link';
import type { DealValue } from '@/lib/funnel';
import {
  HEALTH_LABEL,
  expenseHealth,
  incomeHealth,
  taskHealth,
  type Health,
  type HealthLine,
} from '@/lib/health';
import type { IncomeConfig, IncomeItemValue } from '@/lib/income';
import { cn } from '@/lib/utils';
import { useForum } from './forum-context';

const COLOR: Record<Health, string> = {
  green: '#1E9E5A',
  yellow: '#EAB308',
  red: '#D93838',
};
/** Фон строки: тот же цвет, едва заметный */
const TINT: Record<Health, string> = {
  green: 'rgba(30, 158, 90, 0.06)',
  yellow: 'rgba(234, 179, 8, 0.10)',
  red: 'rgba(217, 56, 56, 0.07)',
};
/** Текст статуса: жёлтый на белом слишком светлый — берём тёмный оттенок */
const TEXT: Record<Health, string> = {
  green: 'text-status-green',
  yellow: 'text-amber-700',
  red: 'text-status-red',
};

/**
 * Три линии над вкладками форума: задачи, расходы, доходы. Цвет — статус:
 * зелёный — всё идёт как запланировано, жёлтый — проверить сроки и цифры, красный — есть отставания.
 */
export function StatusLines({
  income,
}: {
  income: { items: IncomeItemValue[]; config: IncomeConfig; deals: DealValue[] };
}) {
  const { forum, tasks, today } = useForum();
  const tasksLine = React.useMemo(() => taskHealth(tasks, today), [tasks, today]);
  const expensesLine = React.useMemo(
    () => expenseHealth(tasks, forum.expenseLimit),
    [tasks, forum.expenseLimit],
  );
  const incomeLine = React.useMemo(
    () =>
      incomeHealth({
        ...income,
        expenses: tasks.reduce((s, t) => s + t.cost, 0),
        salesStart: forum.salesStartDate,
        forumStart: forum.startDate,
        today,
      }),
    [income, tasks, forum.salesStartDate, forum.startDate, today],
  );
  const base = `/forums/${forum.id}`;
  return (
    <div className="mt-3 flex flex-col gap-1.5 print:hidden" data-testid="status-lines">
      <Line id="tasks" title="Линия задач" href={`${base}/gantt`} line={tasksLine} />
      <Line id="expenses" title="Линия расходов" href={`${base}/expenses`} line={expensesLine} />
      <Line
        id="income"
        title="Линия доходов"
        href={`${base}/income`}
        line={incomeLine}
        note={
          incomeLine.advice.length ? `Рекомендация на сегодня: ${incomeLine.advice.join(' ')}` : ''
        }
      />
    </div>
  );
}

function Line({
  id,
  title,
  href,
  line,
  note,
}: {
  id: string;
  title: string;
  href: string;
  line: HealthLine;
  note?: string;
}) {
  const color = COLOR[line.health];
  return (
    <Link
      href={href}
      className="group grid grid-cols-1 gap-x-4 gap-y-1 rounded-md border border-line px-3 py-2 transition-colors hover:border-ink/20 sm:grid-cols-[210px_minmax(0,1fr)]"
      style={{ background: TINT[line.health], borderLeft: `4px solid ${color}` }}
      data-testid={`status-line-${id}`}
      data-health={line.health}
    >
      <div className="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-0">
        <span className="text-sm font-semibold group-hover:text-brand">{title}</span>
        <span className={cn('text-xs font-medium', TEXT[line.health])}>
          {HEALTH_LABEL[line.health]}
        </span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-ink/70">
          <span className="tabular-nums">{line.summary}</span>
          <span className={cn('first-letter:uppercase', TEXT[line.health])}>
            {line.reasons.join('; ')}
          </span>
        </div>
        <div className="relative mt-1 h-2 w-full rounded-full bg-white ring-1 ring-inset ring-line">
          <div
            className="h-full rounded-full"
            style={{ width: `${line.fill * 100}%`, background: color }}
          />
          {line.mark !== null && (
            <div
              className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink/60"
              style={{ left: `calc(${line.mark * 100}% - 1px)` }}
              title={line.markLabel}
            />
          )}
        </div>
        {note && (
          <div className="mt-1 truncate text-xs text-ink/60" title={note}>
            {note}
          </div>
        )}
      </div>
    </Link>
  );
}
