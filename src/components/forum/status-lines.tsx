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

/** Цвет статуса — у линии и короткой метки, строка без заливки */
const BAR: Record<Health, string> = {
  green: 'bg-status-green',
  yellow: 'bg-status-yellow',
  red: 'bg-status-red',
};
const BADGE: Record<Health, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  yellow: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
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
    <div
      className="mt-3 divide-y divide-line/70 rounded-lg border border-line bg-white print:hidden"
      data-testid="status-lines"
    >
      <Line id="tasks" title="Задачи" href={`${base}/gantt`} line={tasksLine} />
      <Line id="expenses" title="Расходы" href={`${base}/expenses`} line={expensesLine} />
      <Line
        id="income"
        title="Доходы"
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
  // Подробности — во всплывающей подсказке, на линии только главное
  const hint = [`${HEALTH_LABEL[line.health]}: ${line.reasons.join('; ')}`, line.summary, note]
    .filter(Boolean)
    .join('\n');
  return (
    <Link
      href={href}
      title={hint}
      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-3 py-2 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-surface/60 sm:grid-cols-[120px_minmax(0,1fr)_170px_190px]"
      data-testid={`status-line-${id}`}
      data-health={line.health}
    >
      <span className="flex items-center gap-2 text-sm font-medium group-hover:text-brand">
        {title}
      </span>
      <span className="col-span-2 row-start-2 flex items-center gap-3 sm:contents">
        <span className="relative h-1.5 min-w-0 flex-1 rounded-full bg-surface sm:col-start-2 sm:row-start-1">
          <span
            className={cn('block h-full rounded-full', BAR[line.health])}
            style={{ width: `${line.fill * 100}%` }}
          />
          {line.mark !== null && (
            <span
              className="absolute -top-[3px] h-3 w-px bg-ink/40"
              style={{ left: `${line.mark * 100}%` }}
            />
          )}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-ink/70 sm:col-start-3 sm:row-start-1 sm:text-right">
          {line.value}
        </span>
      </span>
      <span
        className={cn(
          'justify-self-end truncate rounded-full px-2.5 py-0.5 text-xs font-medium sm:col-start-4 sm:row-start-1',
          BADGE[line.health],
        )}
      >
        {line.badge}
      </span>
    </Link>
  );
}
