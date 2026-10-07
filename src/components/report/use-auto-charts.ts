'use client';

import * as React from 'react';
import { useForum } from '@/components/forum/forum-context';
import { autoItems, computeAutoRows } from '@/lib/report/auto-charts';
import type { TaskDTO } from '@/lib/types';
import type { ChartDTO } from '@/server/report-queries';

/**
 * Диаграммы с посчитанными строками: у автоматических строки берутся из текущих данных
 * «Расходов» и «Доходов», поэтому меняются вместе с этими вкладками.
 */
export function useAutoCharts(charts: ChartDTO[]): ChartDTO[] {
  const { forum, tasks, lookups, income, today } = useForum();
  const blockOf = React.useCallback(
    (t: TaskDTO) => (t.blockId ? (lookups.block.get(t.blockId) ?? null) : null),
    [lookups],
  );
  const rows = React.useMemo(
    () =>
      computeAutoRows({
        tasks,
        blockOf,
        expenseLimit: forum.expenseLimit,
        income,
        salesStart: forum.salesStartDate,
        forumStart: forum.startDate,
        today,
      }),
    [tasks, blockOf, forum.expenseLimit, forum.salesStartDate, forum.startDate, income, today],
  );
  return React.useMemo(
    () => charts.map((c) => (c.source ? { ...c, items: autoItems(rows[c.source], c.unit) } : c)),
    [charts, rows],
  );
}
