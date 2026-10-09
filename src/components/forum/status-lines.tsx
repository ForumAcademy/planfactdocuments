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
import type { DueFilter } from '@/lib/filters';
import type { TaskAlert } from '@/lib/status';
import { targetExpenses, type IncomeConfig, type IncomeItemValue } from '@/lib/income';
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
  const { forum, tasks, today, soonDays } = useForum();
  const tasksLine = React.useMemo(
    () => taskHealth(tasks, today, soonDays),
    [tasks, today, soonDays],
  );
  const expensesLine = React.useMemo(
    () => expenseHealth(tasks, forum.expenseLimit),
    [tasks, forum.expenseLimit],
  );
  const incomeLine = React.useMemo(
    () =>
      incomeHealth({
        ...income,
        expenses: targetExpenses(tasks, forum.expenseLimit),
        salesStart: forum.salesStartDate,
        forumStart: forum.startDate,
        today,
      }),
    [income, tasks, forum.expenseLimit, forum.salesStartDate, forum.startDate, today],
  );
  const base = `/forums/${forum.id}`;
  return (
    <div
      className="mt-3 divide-y divide-line/70 rounded-lg border border-line bg-white print:hidden"
      data-testid="status-lines"
    >
      <Line
        id="tasks"
        title="Задачи"
        href={`${base}/tasks`}
        line={tasksLine}
        badges={tasksLine.alerts?.map((a) => ({
          label: `${a.label} ${a.count}`,
          href: `${base}/tasks?due=${DUE[a.kind]}`,
        }))}
      />
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

/** Каждая метка линии задач открывает список именно этих задач */
const DUE: Record<TaskAlert, DueFilter> = {
  overdue: 'overdue',
  due_soon: 'soon',
  should_start: 'start',
};

function Line({
  id,
  title,
  href,
  line,
  note,
  badges,
}: {
  id: string;
  title: string;
  href: string;
  line: HealthLine;
  note?: string;
  /** Несколько меток со своими ссылками (у задач — по разделу на метку) */
  badges?: { label: string; href: string }[];
}) {
  // Подробности — во всплывающей подсказке, на линии только главное
  const hint = [`${HEALTH_LABEL[line.health]}: ${line.reasons.join('; ')}`, line.summary, note]
    .filter(Boolean)
    .join('\n');
  const pill = 'whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium';
  return (
    <div
      title={hint}
      className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-3 py-2 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-surface/60 sm:grid-cols-[120px_minmax(0,1fr)_200px_340px]"
      data-testid={`status-line-${id}`}
      data-health={line.health}
    >
      {/* Ссылка растянута на всю строку; метки со своими ссылками лежат поверх */}
      <Link
        href={href}
        className="flex items-center gap-2 text-sm font-medium after:absolute after:inset-0 after:rounded-[inherit] group-hover:text-brand"
      >
        {title}
      </Link>
      <span className="col-span-2 row-start-2 flex items-center gap-3 sm:contents">
        <span className="h-1.5 min-w-0 flex-1 rounded-full bg-surface sm:col-start-2 sm:row-start-1">
          <span
            className={cn('block h-full rounded-full', BAR[line.health])}
            style={{ width: `${line.fill * 100}%` }}
          />
        </span>
        <span className="shrink-0 text-xs tabular-nums text-ink/70 sm:col-start-3 sm:row-start-1 sm:text-right">
          {line.value}
        </span>
      </span>
      <span className="flex flex-wrap justify-end gap-1 justify-self-end sm:col-start-4 sm:row-start-1">
        {badges?.length ? (
          badges.map((b, i) => (
            <Link
              key={b.label}
              href={b.href}
              className={cn(
                pill,
                'relative z-10 hover:ring-1 hover:ring-current',
                // Просрочка — красная, остальные разделы — жёлтые
                BADGE[i === 0 && line.health === 'red' ? 'red' : 'yellow'],
              )}
              data-testid="status-badge"
            >
              {b.label}
            </Link>
          ))
        ) : (
          <span className={cn(pill, 'truncate', BADGE[line.health])} data-testid="status-badge">
            {line.badge}
          </span>
        )}
      </span>
    </div>
  );
}
