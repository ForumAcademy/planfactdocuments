import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { DealValue } from '@/lib/funnel';
import { dealCountsInFact } from '@/lib/income';
import { formatRub } from '@/lib/utils';

/**
 * Оплаченные сделки воронки сами входят в факт доходов, каждая по своей сумме.
 * Здесь — короткая кнопка-переход к ним в таблицу воронки (по образцу кнопки «в факте доходов» в воронке).
 */
export function DealsInFact({ forumId, deals }: { forumId: number; deals: DealValue[] }) {
  const counted = deals.filter((d) => d.status === 'paid' && dealCountsInFact(d));
  if (counted.length === 0) return null;
  return (
    <Link
      href={`/forums/${forumId}/funnel?view=table&status=paid`}
      className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-status-green/30 bg-status-green/10 px-3 py-1.5 text-sm text-status-green hover:bg-status-green/15"
      data-testid="income-funnel-deals"
    >
      Оплачено {formatRub(counted.reduce((s, d) => s + d.amount, 0))} — в воронке продаж
      <ArrowRight className="size-3.5" />
    </Link>
  );
}
