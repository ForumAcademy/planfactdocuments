'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Inbox, RotateCcw, X } from 'lucide-react';
import { formatDate } from '@/lib/dates';
import type { DealValue } from '@/lib/funnel';
import {
  PRICE_STAGES,
  dealCountsInFact,
  dealItem,
  hasStages,
  type IncomeItemValue,
} from '@/lib/income';
import { cn, formatRub, pluralRu } from '@/lib/utils';
import { setDealExcluded } from '@/server/actions/funnel';

const dealsWord = (n: number) =>
  pluralRu(n, 'оплаченная сделка', 'оплаченные сделки', 'оплаченных сделок');

/**
 * Оплаченные сделки воронки в факте доходов: попадают туда сами, каждая по своей сумме.
 * Сводка одной строкой; по клику — список сделок со статьёй и скидкой клиента от цены статьи.
 */
export function DealsInFact({
  forumId,
  deals,
  setDeals,
  items,
  dates,
  today,
}: {
  forumId: number;
  deals: DealValue[];
  setDeals: React.Dispatch<React.SetStateAction<DealValue[]>>;
  items: IncomeItemValue[];
  dates: [string, string, string];
  today: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<number | null>(null);
  const paid = deals
    .filter((d) => d.status === 'paid' && d.incomeStatus !== 'added')
    .sort((a, b) => (b.paidDate ?? '').localeCompare(a.paidDate ?? ''));
  const counted = paid.filter(dealCountsInFact);
  const excluded = paid.length - counted.length;
  const sum = counted.reduce((s, d) => s + d.amount, 0);

  const toggle = async (d: DealValue, exclude: boolean) => {
    setBusy(d.id);
    const res = await setDealExcluded(forumId, d.id, exclude);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setDeals((list) => list.map((x) => (x.id === d.id ? res.data : x)));
  };

  return (
    <section
      className="mt-4 rounded-lg border border-status-green/30 bg-status-green/5 px-4 py-2.5 text-sm"
      data-testid="income-funnel-deals"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 font-medium text-status-green">
          <Inbox className="size-4 self-center" />
          Из воронки в факте: {counted.length} {dealsWord(counted.length)} на {formatRub(sum)}
        </span>
        {excluded > 0 && <span className="text-xs text-ink/60">исключено {excluded}</span>}
        {paid.length > 0 && (
          <button
            type="button"
            className="text-xs text-brand hover:underline"
            onClick={() => setOpen(!open)}
            data-testid="income-funnel-deals-toggle"
          >
            {open ? 'Скрыть сделки ▴' : 'Показать сделки ▾'}
          </button>
        )}
        <Link
          href={`/forums/${forumId}/funnel?view=table`}
          className="ml-auto text-xs text-brand hover:underline"
        >
          Воронка
        </Link>
      </div>
      {open && paid.length > 0 && (
        <div className="thin-scroll mt-2 max-h-[360px] overflow-auto rounded-md border border-line bg-white">
          <table className="w-full min-w-[860px]">
            <thead className="sticky top-0 bg-surface text-xs text-ink/60">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Компания</th>
                <th className="px-2 py-1.5 text-left font-medium">Оплата</th>
                <th className="px-2 py-1.5 text-left font-medium">Статья</th>
                <th className="px-2 py-1.5 text-right font-medium">Шт.</th>
                <th className="px-2 py-1.5 text-right font-medium">Сумма</th>
                <th className="px-2 py-1.5 text-right font-medium">Скидка клиента</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {paid.map((d) => {
                const on = dealCountsInFact(d);
                const it = dealItem(items, d, dates, today);
                const qty = Math.max(1, d.qty);
                const list = it ? it.prices[it.stage] * qty : 0;
                const disc = list > 0 ? Math.round((1 - d.amount / list) * 1000) / 10 : 0;
                return (
                  <tr
                    key={d.id}
                    className={cn('border-t border-line', !on && 'text-ink/40')}
                    data-testid="income-funnel-deal"
                  >
                    <td className="max-w-[260px] truncate px-2 py-1.5" title={d.company}>
                      {d.company}
                      {d.manager && <div className="text-xs text-ink/50">{d.manager}</div>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {formatDate(d.paidDate) || '—'}
                    </td>
                    <td className="px-2 py-1.5">
                      {it?.label ?? '—'}
                      {it && hasStages(it) && (
                        <div className="text-xs text-ink/50">{PRICE_STAGES[it.stage].label}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{qty}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      {formatRub(d.amount)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      {!list || Math.abs(disc) < 0.5
                        ? 'по цене'
                        : disc > 0
                          ? `−${disc.toLocaleString('ru-RU')}%`
                          : `+${(-disc).toLocaleString('ru-RU')}%`}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => void toggle(d, on)}
                        disabled={busy === d.id}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs disabled:opacity-50',
                          on
                            ? 'text-ink/60 hover:bg-status-red/10 hover:text-status-red'
                            : 'text-brand hover:bg-brand/10',
                        )}
                        title={
                          on ? 'Не учитывать в факте (например, дубль)' : 'Снова учитывать в факте'
                        }
                      >
                        {on ? <X className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                        {on ? 'Исключить' : 'Вернуть'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
