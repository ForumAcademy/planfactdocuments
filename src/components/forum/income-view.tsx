'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { NumberCell } from '@/components/ui/number-cell';
import { Spinner } from '@/components/ui/spinner';
import { TabGroup, TabLink } from '@/components/ui/tab-links';
import {
  INCOME_GROUPS,
  INCOME_MARGIN,
  incomeLevel,
  incomeSum,
  incomeTarget,
  type IncomeGroup,
  type IncomeLevel,
  type IncomeItemKey,
  type IncomeItemValue,
} from '@/lib/income';
import { cn, formatRub, formatRubShort } from '@/lib/utils';
import { saveIncomeItems } from '@/server/actions/income';
import { useForum } from './forum-context';

type Patch = { key: IncomeItemKey } & Partial<Omit<IncomeItemValue, 'key'>>;

const pctOf = (part: number, total: number) =>
  total ? `${Math.round((part / total) * 100).toLocaleString('ru-RU')}%` : '—';
const formatQty = (n: number) => `${n.toLocaleString('ru-RU').replace(/ | /g, ' ')} шт.`;

export function IncomeView({ initialItems }: { initialItems: IncomeItemValue[] }) {
  const { forum, tasks } = useForum();
  const sp = useSearchParams();
  const view = sp.get('view') === 'fact' ? 'fact' : 'plan';
  const [items, setItems] = React.useState(initialItems);
  const [saving, setSaving] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  const expenses = tasks.reduce((s, t) => s + t.cost, 0);
  const target = incomeTarget(expenses);
  const planSum = incomeSum(items, 'planQty');
  const factSum = incomeSum(items, 'factQty');
  const byKey = new Map(items.map((i) => [i.key, i]));

  const save = async (patches: Patch[]) => {
    const prev = items;
    setItems((list) =>
      list.map((i) => {
        const p = patches.find((x) => x.key === i.key);
        return p ? { ...i, ...p } : i;
      }),
    );
    setSaving(true);
    const res = await saveIncomeItems(forum.id, patches);
    setSaving(false);
    if (res.ok) setItems(res.data);
    else {
      setItems(prev);
      toast.error(res.error);
    }
  };

  const toggle = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const base = `/forums/${forum.id}/income`;
  const planGap = target - planSum;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4" data-testid="income-view">
      <IncomeSummary
        forumId={forum.id}
        expenses={expenses}
        target={target}
        plan={planSum}
        fact={factSum}
      />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <TabGroup
          className="inline-flex rounded-lg border border-line bg-surface p-0.5"
          role="tablist"
        >
          {(
            [
              ['plan', 'План', base],
              ['fact', 'Факт', `${base}?view=fact`],
            ] as const
          ).map(([key, label, href]) => (
            <TabLink
              key={key}
              href={href}
              role="tab"
              replace
              scroll={false}
              active={view === key}
              className="inline-flex items-center rounded-md px-5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              activeClassName="bg-white font-medium text-brand shadow-sm"
              inactiveClassName="text-ink/70 hover:text-ink"
              data-testid={`income-tab-${key}`}
            >
              {label}
            </TabLink>
          ))}
        </TabGroup>
        {saving && <Spinner className="text-xs" label="Сохраняем…" />}
      </div>

      {view === 'plan' ? (
        <>
          <div className="mt-4">
            <h2 className="font-semibold">План продаж</h2>
            <p className="max-w-3xl text-xs text-ink/60">
              Задайте стоимость одной единицы и плановое количество — сумма плана сразу учитывается
              в итоге и на шкале выше.
            </p>
          </div>
          <div className="thin-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-surface text-left text-xs text-ink/70">
                <tr>
                  <th className="px-3 py-2 font-medium">Позиция</th>
                  <th className="w-40 px-2 py-2 text-right font-medium">Стоимость 1 ед.</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">План, шт.</th>
                  <th className="w-40 px-2 py-2 text-right font-medium">Сумма по плану</th>
                  <th className="w-24 px-3 py-2 text-right font-medium">Доля</th>
                </tr>
              </thead>
              {INCOME_GROUPS.map((g) => {
                const list = g.items.map((d) => byKey.get(d.key)!);
                const open = !collapsed.has(g.key);
                return (
                  <tbody key={g.key} data-testid={`income-group-${g.key}`}>
                    <GroupRow
                      group={g}
                      open={open}
                      onToggle={() => toggle(g.key)}
                      cells={[
                        null,
                        formatQty(list.reduce((s, i) => s + i.planQty, 0)),
                        formatRub(incomeSum(list, 'planQty')),
                        <span key="share" className="font-normal text-ink/70">
                          {pctOf(incomeSum(list, 'planQty'), planSum)}
                        </span>,
                      ]}
                    />
                    {open &&
                      g.items.map((d) => {
                        const it = byKey.get(d.key)!;
                        return (
                          <tr
                            key={d.key}
                            className="border-t border-line/60"
                            data-testid="income-row"
                          >
                            <td className="py-1.5 pl-12 pr-3">{d.label}</td>
                            <td className="px-1 py-1">
                              <NumberCell
                                value={it.price}
                                format={formatRub}
                                label={`Стоимость 1 ед.: ${d.label}`}
                                onCommit={(price) => save([{ key: d.key, price }])}
                                testId={`income-price-${d.key}`}
                              />
                            </td>
                            <td className="px-1 py-1">
                              <NumberCell
                                value={it.planQty}
                                format={formatQty}
                                label={`План, шт.: ${d.label}`}
                                onCommit={(planQty) => save([{ key: d.key, planQty }])}
                                testId={`income-plan-${d.key}`}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {formatRub(it.price * it.planQty)}
                            </td>
                            <td className="px-3 py-1.5 text-right text-xs tabular-nums text-ink/60">
                              {it.planQty ? pctOf(it.price * it.planQty, planSum) : ''}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                );
              })}
              <tfoot>
                <tr className="border-t-2 border-brand/40 font-semibold">
                  <td className="px-3 py-2.5" colSpan={3}>
                    Итого
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatRub(planSum)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{planSum ? '100%' : '—'}</td>
                </tr>
                <tr className="border-t border-line text-ink/70">
                  <td className="px-3 py-2" colSpan={3}>
                    Цель: расходы {formatRub(expenses)} + {Math.round(INCOME_MARGIN * 100)}%
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatRub(target)}</td>
                  <td />
                </tr>
                {target > 0 && (
                  <tr className="border-t border-line">
                    <td className="px-3 py-2" colSpan={3}>
                      {planGap > 0 ? 'До цели по плану не хватает' : 'План выше цели на'}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-2 text-right font-medium tabular-nums',
                        planGap > 0 ? 'text-status-red' : 'text-status-green',
                      )}
                      data-testid="income-plan-gap"
                    >
                      {formatRub(Math.abs(planGap))}
                    </td>
                    <td />
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="mt-5">
            <h2 className="font-semibold">Фактические продажи</h2>
            <p className="text-xs text-ink/60">
              Укажите, сколько партнёрств и билетов продано на сегодня. Стоимость единицы задаётся
              во вкладке «План».
            </p>
          </div>
          <div className="thin-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-surface text-left text-xs text-ink/70">
                <tr>
                  <th className="px-3 py-2 font-medium">Позиция</th>
                  <th className="w-40 px-2 py-2 text-right font-medium">Стоимость 1 ед.</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">Продано, шт.</th>
                  <th className="w-40 px-2 py-2 text-right font-medium">Сумма продаж</th>
                  <th className="w-36 px-2 py-2 text-right font-medium">План</th>
                  <th
                    className="w-44 px-3 py-2 text-right font-medium"
                    title="Доля продаж от плана по сумме"
                  >
                    Выполнение плана
                  </th>
                </tr>
              </thead>
              {INCOME_GROUPS.map((g) => {
                const list = g.items.map((d) => byKey.get(d.key)!);
                const open = !collapsed.has(g.key);
                const fact = incomeSum(list, 'factQty');
                const plan = incomeSum(list, 'planQty');
                return (
                  <tbody key={g.key} data-testid={`income-group-${g.key}`}>
                    <GroupRow
                      group={g}
                      open={open}
                      onToggle={() => toggle(g.key)}
                      cells={[
                        null,
                        formatQty(list.reduce((s, i) => s + i.factQty, 0)),
                        formatRub(fact),
                        formatQty(list.reduce((s, i) => s + i.planQty, 0)),
                        <Progress key="p" part={fact} total={plan} />,
                      ]}
                    />
                    {open &&
                      g.items.map((d) => {
                        const it = byKey.get(d.key)!;
                        return (
                          <tr
                            key={d.key}
                            className="border-t border-line/60"
                            data-testid="income-row"
                          >
                            <td className="py-1.5 pl-12 pr-3">{d.label}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-ink/70">
                              {formatRub(it.price)}
                            </td>
                            <td className="px-1 py-1">
                              <NumberCell
                                value={it.factQty}
                                format={formatQty}
                                label={`Продано, шт.: ${d.label}`}
                                onCommit={(factQty) => save([{ key: d.key, factQty }])}
                                testId={`income-fact-${d.key}`}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {formatRub(it.price * it.factQty)}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-ink/70">
                              {formatQty(it.planQty)}
                            </td>
                            <td className="px-3 py-1.5">
                              <Progress part={it.factQty} total={it.planQty} />
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                );
              })}
              <tfoot>
                <tr className="border-t-2 border-brand/40 font-semibold">
                  <td className="px-3 py-2.5" colSpan={3}>
                    Итого продано
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatRub(factSum)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-ink/70">
                    {formatRub(planSum)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Progress part={factSum} total={planSum} />
                  </td>
                </tr>
                <tr className="border-t border-line text-ink/70">
                  <td className="px-3 py-2" colSpan={3}>
                    Цель: расходы {formatRub(expenses)} + {Math.round(INCOME_MARGIN * 100)}%
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatRub(target)}</td>
                  <td />
                  <td className="px-3 py-2">
                    <Progress part={factSum} total={target} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const LEVEL_BAR: Record<IncomeLevel, string> = {
  loss: 'bg-status-red',
  covered: 'bg-brand',
  target: 'bg-status-green',
};
const LEVEL_TEXT: Record<IncomeLevel, string> = {
  loss: 'text-status-red',
  covered: 'text-brand',
  target: 'text-status-green',
};

/**
 * Сводка доходов над вкладками «План» / «Факт»: две полосы (план и факт) на одной
 * шкале с отметками «Расходы» и «Цель» — сразу видно, покрывают ли продажи расходы
 * и достигнута ли цель.
 */
function IncomeSummary({
  forumId,
  expenses,
  target,
  plan,
  fact,
}: {
  forumId: number;
  expenses: number;
  target: number;
  plan: number;
  fact: number;
}) {
  const max = Math.max(target * 1.15, plan, fact) || 1;
  const at = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const rows = [
    {
      key: 'plan',
      label: 'План',
      value: plan,
      note: target ? `${pctOf(plan, target)} от цели` : null,
      muted: true,
    },
    {
      key: 'fact',
      label: 'Факт',
      value: fact,
      note: [target && `${pctOf(fact, target)} от цели`, plan && `${pctOf(fact, plan)} от плана`]
        .filter(Boolean)
        .join(' · '),
      muted: false,
    },
  ];
  return (
    <section
      className="rounded-lg border border-line bg-white px-4 py-3"
      data-testid="income-summary"
    >
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div>
          <span className="text-xs text-ink/60">
            Цель по доходу (расходы + {Math.round(INCOME_MARGIN * 100)}%)
          </span>
          <div className="text-xl font-semibold tabular-nums" data-testid="income-target">
            {formatRub(target)}
          </div>
        </div>
        <div className="text-sm text-ink/70">
          Расходы{' '}
          <Link href={`/forums/${forumId}/expenses`} className="text-brand hover:underline">
            {formatRub(expenses)}
          </Link>
          {!expenses && (
            <span className="ml-2 text-xs">— заполните стоимость задач, чтобы появилась цель</span>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[3rem_1fr] gap-x-3 gap-y-2 sm:grid-cols-[3rem_1fr_13rem]">
        {rows.map((r) => {
          const level = incomeLevel(r.value, expenses, target);
          return (
            <React.Fragment key={r.key}>
              <div className="self-center text-sm font-medium">{r.label}</div>
              <div className="relative h-6 self-center overflow-hidden rounded bg-surface">
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded',
                    LEVEL_BAR[level],
                    r.muted && 'opacity-60',
                  )}
                  style={{ width: at(r.value) }}
                  title={`${r.label}: ${formatRub(r.value)}`}
                />
                {expenses > 0 && <Marker left={at(expenses)} />}
                {target > 0 && <Marker left={at(target)} strong />}
              </div>
              <div className="col-start-2 sm:col-start-auto">
                <div className="font-semibold tabular-nums" data-testid={`income-${r.key}-total`}>
                  {formatRub(r.value)}
                </div>
                {r.note && (
                  <div className={cn('text-xs', target ? LEVEL_TEXT[level] : 'text-ink/60')}>
                    {r.note}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
        {target > 0 && (
          <div className="relative col-start-2 h-4 text-[11px] text-ink/60">
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: at(expenses) }}
            >
              Расходы<span className="hidden sm:inline"> · {formatRubShort(expenses)}</span>
            </span>
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap font-medium text-ink"
              style={{ left: at(target) }}
            >
              Цель<span className="hidden sm:inline"> · {formatRubShort(target)}</span>
            </span>
          </div>
        )}
      </div>
      {target > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
          <Legend className="bg-status-red" label="Не покрывает расходы" />
          <Legend className="bg-brand" label="Расходы покрыты" />
          <Legend className="bg-status-green" label="Цель достигнута" />
        </div>
      )}
    </section>
  );
}

function Marker({ left, strong }: { left: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        'absolute inset-y-0 w-0 border-l-2',
        strong ? 'border-ink/80' : 'border-dashed border-ink/40',
      )}
      style={{ left }}
    />
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-sm', className)} />
      {label}
    </span>
  );
}

function GroupRow({
  group: g,
  open,
  onToggle,
  cells,
}: {
  group: IncomeGroup;
  open: boolean;
  onToggle: () => void;
  cells: React.ReactNode[];
}) {
  return (
    <tr
      className="cursor-pointer border-t border-line hover:bg-surface/60"
      onClick={onToggle}
      aria-expanded={open}
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="size-4 shrink-0" />
          ) : (
            <ChevronRight className="size-4 shrink-0" />
          )}
          <span className="h-4 w-1.5 shrink-0 rounded-sm" style={{ background: g.color }} />
          <span className="font-semibold">{g.label}</span>
        </div>
      </td>
      {cells.map((c, i) => (
        <td
          key={i}
          className={cn(
            'px-2 py-2.5 text-right font-semibold tabular-nums',
            i === cells.length - 1 && 'px-3',
          )}
        >
          {c}
        </td>
      ))}
    </tr>
  );
}

function Progress({ part, total }: { part: number; total: number }) {
  if (!total) return <div className="text-right text-xs text-status-gray">—</div>;
  const p = (part / total) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
        <div
          className={cn('h-full', p >= 100 ? 'bg-status-green' : 'bg-brand')}
          style={{ width: `${Math.min(100, p)}%` }}
        />
      </div>
      <span className="w-11 text-right text-xs tabular-nums">{Math.round(p)}%</span>
    </div>
  );
}
