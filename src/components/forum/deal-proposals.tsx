'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, Inbox, Pencil, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/dates';
import type { DealValue } from '@/lib/funnel';
import { PRICE_STAGES, currentStage, type IncomeItemValue } from '@/lib/income';
import { formatRub, pluralRu } from '@/lib/utils';
import { decideDealIncome } from '@/server/actions/funnel';

/**
 * Оплаченные сделки из воронки — предложения добавить продажу в факт доходов.
 * Менеджер добавляет её в статью направления, добавляет под своим названием (особые условия)
 * или отклоняет.
 */
export function DealProposals({
  forumId,
  deals,
  setDeals,
  items,
  onItems,
  dates,
  today,
}: {
  forumId: number;
  deals: DealValue[];
  setDeals: React.Dispatch<React.SetStateAction<DealValue[]>>;
  items: IncomeItemValue[];
  onItems: (items: IncomeItemValue[]) => void;
  dates: [string, string, string];
  today: string;
}) {
  const [busy, setBusy] = React.useState<number | null>(null);
  const [renaming, setRenaming] = React.useState<number | null>(null);
  const [label, setLabel] = React.useState('');
  const [showRejected, setShowRejected] = React.useState(false);
  const pending = deals
    .filter((d) => d.status === 'paid' && d.incomeStatus === null)
    .sort((a, b) => (a.paidDate ?? '').localeCompare(b.paidDate ?? ''));
  const rejected = deals.filter((d) => d.status === 'paid' && d.incomeStatus === 'rejected');
  if (!pending.length && !rejected.length) return null;

  const direction = (d: DealValue) =>
    items.find((i) => i.key === d.incomeKey) ??
    items.find((i) => i.key === 'participant') ??
    items.find((i) => i.group === 'tickets');

  const decide = async (
    d: DealValue,
    decision: { action: 'add'; label?: string } | { action: 'reject' } | { action: 'reset' },
  ) => {
    setBusy(d.id);
    const res = await decideDealIncome(forumId, d.id, decision);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onItems(res.data.items);
    setDeals((list) => list.map((x) => (x.id === d.id ? res.data.deal : x)));
    setRenaming(null);
    if (decision.action === 'add') {
      const it = res.data.items.find((i) => i.key === res.data.deal.incomeItemKey);
      toast.success(`«${d.company}» добавлена в факт${it ? `: ${it.label}` : ''}`);
    }
  };

  return (
    <section
      className="mt-4 rounded-lg border border-status-green/30 bg-status-green/5 px-4 py-3 text-sm"
      data-testid="income-deal-proposals"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-2 font-semibold text-status-green">
          <Inbox className="size-4" />
          Оплаты из воронки продаж
          {pending.length > 0 && (
            <span className="rounded-full bg-status-green px-2 py-0.5 text-xs text-white">
              {pending.length}
            </span>
          )}
        </h3>
        <span className="text-xs text-ink/60">
          Добавьте продажу в факт, переименуйте статью, если условия особые, или отклоните
        </span>
        <Link
          href={`/forums/${forumId}/funnel?view=table`}
          className="ml-auto text-xs text-brand hover:underline"
        >
          Воронка
        </Link>
      </div>
      {pending.length === 0 ? (
        <p className="mt-2 text-ink/60">Новых оплат нет — все разобраны.</p>
      ) : (
        <div className="thin-scroll mt-2 max-h-[360px] overflow-auto rounded-md border border-line bg-white">
          <table className="w-full min-w-[900px]">
            <thead className="sticky top-0 bg-surface text-xs text-ink/60">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Компания</th>
                <th className="px-2 py-1.5 text-left font-medium">Оплата</th>
                <th className="px-2 py-1.5 text-right font-medium">Шт.</th>
                <th className="px-2 py-1.5 text-right font-medium">Сумма</th>
                <th className="px-2 py-1.5 text-left font-medium">Статья дохода</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {pending.map((d) => {
                const dir = direction(d);
                const stage =
                  dir?.group === 'tickets' ? currentStage(dates, d.paidDate ?? today) : null;
                const qty = Math.max(1, d.qty);
                return (
                  <tr key={d.id} className="border-t border-line" data-testid="deal-proposal">
                    <td className="max-w-[260px] truncate px-2 py-1.5" title={d.company}>
                      {d.company}
                      <div className="text-xs text-ink/50">
                        {[d.source, d.manager].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {formatDate(d.paidDate) || '—'}
                      {stage !== null && (
                        <div className="text-xs text-ink/50">{PRICE_STAGES[stage].label}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{qty}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      {formatRub(d.amount)}
                      {qty > 1 && (
                        <div className="text-xs text-ink/50">
                          по {formatRub(Math.round(d.amount / qty))}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {renaming === d.id ? (
                        <input
                          autoFocus
                          value={label}
                          onChange={(e) => setLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && label.trim())
                              void decide(d, { action: 'add', label: label.trim() });
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          placeholder="Например, «Участник — особые условия»"
                          className="h-8 w-full min-w-[220px] rounded border border-brand px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
                          data-testid="deal-proposal-label"
                        />
                      ) : (
                        <span>{dir?.label ?? '—'}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      {renaming === d.id ? (
                        <>
                          <Button
                            size="iconSm"
                            onClick={() => void decide(d, { action: 'add', label: label.trim() })}
                            disabled={!label.trim() || busy === d.id}
                            title="Добавить под этим названием"
                          >
                            <Check />
                          </Button>
                          <Button
                            size="iconSm"
                            variant="ghost"
                            onClick={() => setRenaming(null)}
                            title="Отмена"
                          >
                            <X />
                          </Button>
                        </>
                      ) : (
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => void decide(d, { action: 'add' })}
                            disabled={busy === d.id}
                            className="inline-flex items-center gap-1 rounded-md bg-status-green px-2.5 py-1 text-xs font-medium text-white hover:bg-status-green/90 disabled:opacity-50"
                            data-testid="deal-proposal-add"
                          >
                            <Check className="size-3.5" />
                            Добавить
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLabel(dir ? `${dir.label} — особые условия` : '');
                              setRenaming(d.id);
                            }}
                            disabled={busy === d.id}
                            className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 text-xs hover:bg-surface"
                          >
                            <Pencil className="size-3.5" />
                            Переименовать
                          </button>
                          <button
                            type="button"
                            onClick={() => void decide(d, { action: 'reject' })}
                            disabled={busy === d.id}
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-ink/60 hover:bg-status-red/10 hover:text-status-red"
                          >
                            <X className="size-3.5" />
                            Отклонить
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rejected.length > 0 && (
        <div className="mt-2 text-xs text-ink/60">
          <button
            type="button"
            className="hover:underline"
            onClick={() => setShowRejected(!showRejected)}
          >
            Отклонено {rejected.length}{' '}
            {pluralRu(rejected.length, 'предложение', 'предложения', 'предложений')}{' '}
            {showRejected ? '▴' : '▾'}
          </button>
          {showRejected && (
            <ul className="mt-1 space-y-0.5">
              {rejected.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <span>
                    {d.company} · {formatRub(d.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void decide(d, { action: 'reset' })}
                    className="inline-flex items-center gap-1 text-brand hover:underline"
                  >
                    <RotateCcw className="size-3" />
                    Вернуть
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
