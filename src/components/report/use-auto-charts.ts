'use client';

import * as React from 'react';
import { useForum } from '@/components/forum/forum-context';
import {
  autoItems,
  computeAutoRows,
  type AutoRow,
  type AutoSource,
} from '@/lib/report/auto-charts';
import type { TaskDTO } from '@/lib/types';
import type { ChartDTO } from '@/server/report-queries';

/**
 * Диаграммы со строками в их единице измерения. У автоматической строки — снимок «Расходов» и
 * «Доходов» на момент последнего «Автообновления» (в базе — в рублях); пока снимка нет,
 * показываются текущие данные. rows — текущие данные для «Автообновления».
 */
export function useAutoCharts(charts: ChartDTO[]): {
  shown: ChartDTO[];
  rows: Record<AutoSource, AutoRow[]>;
} {
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
  const shown = React.useMemo(
    () =>
      charts.map((c) => {
        if (!c.source) return c;
        const saved = c.refreshedAt
          ? c.items.map((i) => ({ name: i.name, rub: i.amount }))
          : rows[c.source];
        return { ...c, items: autoItems(saved, c.unit) };
      }),
    [charts, rows],
  );
  return { shown, rows };
}
