'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { TabGroup, TabLink } from '@/components/ui/tab-links';
import {
  INCOME_GROUPS,
  INCOME_MARGIN,
  forecastQuantities,
  incomeSum,
  incomeTarget,
  type IncomeGroup,
  type IncomeItemKey,
  type IncomeItemValue,
} from '@/lib/income';
import { cn, formatRub } from '@/lib/utils';
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
  const forecast = React.useMemo(() => forecastQuantities(items, target), [items, target]);
  const forecastSum = items.reduce((s, i) => s + i.price * forecast[i.key], 0);
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

  const applyForecast = () =>
    void save(items.map((i) => ({ key: i.key, planQty: forecast[i.key] }))).then(() =>
      toast.success('Расчёт перенесён в план'),
    );

  const toggle = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const base = `/forums/${forum.id}/income`;
  const gap = target - (view === 'plan' ? planSum : factSum);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4" data-testid="income-view">
      <div className="flex flex-wrap items-center gap-3">
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
              className="rounded-md px-5 py-1.5 text-sm"
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

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label="Расходы (линия расходов)"
          value={formatRub(expenses)}
          note={
            <Link href={`/forums/${forum.id}/expenses`} className="text-brand hover:underline">
              Открыть расходы
            </Link>
          }
        />
        <SummaryCard
          label={`Цель по доходу (расходы + ${Math.round(INCOME_MARGIN * 100)}%)`}
          value={formatRub(target)}
          testId="income-target"
          note={expenses ? null : 'Заполните стоимость задач в линии расходов'}
        />
        <SummaryCard
          label="Доход по плану"
          value={formatRub(planSum)}
          testId="income-plan-total"
          active={view === 'plan'}
          note={target ? `${pctOf(planSum, target)} от цели` : null}
        />
        <SummaryCard
          label="Продано (факт)"
          value={formatRub(factSum)}
          testId="income-fact-total"
          active={view === 'fact'}
          note={
            target || planSum
              ? [
                  target && `${pctOf(factSum, target)} от цели`,
                  planSum && `${pctOf(factSum, planSum)} от плана`,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : null
          }
        />
      </div>

      {target > 0 && (
        <div className="mt-3">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="absolute inset-y-0 left-0 bg-brand/25"
              style={{ width: `${Math.min(100, (planSum / target) * 100)}%` }}
              title={`План: ${formatRub(planSum)}`}
            />
            <div
              className="absolute inset-y-0 left-0 bg-status-green"
              style={{ width: `${Math.min(100, (factSum / target) * 100)}%` }}
              title={`Факт: ${formatRub(factSum)}`}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/70">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-status-green" /> Факт
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-brand/25" /> План
            </span>
            <span
              className={cn(
                'ml-auto font-medium',
                gap > 0 ? 'text-status-red' : 'text-status-green',
              )}
            >
              {gap > 0
                ? `До цели не хватает ${formatRub(gap)} (${view === 'plan' ? 'по плану' : 'по факту'})`
                : `Цель достигнута ${view === 'plan' ? 'по плану' : 'по факту'}`}
            </span>
          </div>
        </div>
      )}

      {view === 'plan' ? (
        <>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <div>
              <h2 className="font-semibold">План продаж и прогнозный калькулятор</h2>
              <p className="max-w-3xl text-xs text-ink/60">
                Задайте стоимость одной единицы и плановое количество. Столбцы «Для цели»
                показывают, сколько нужно продать, чтобы доход покрыл расходы +{' '}
                {Math.round(INCOME_MARGIN * 100)}%: структура продаж берётся из плана (если план
                пуст — типовая), остаток добирается самой доступной позицией.
              </p>
            </div>
            <Button
              variant="outline"
              className="ml-auto"
              onClick={applyForecast}
              disabled={!target || saving}
              title="Записать количества из столбца «Для цели» в план"
              data-testid="income-apply-forecast"
            >
              <Wand2 /> Перенести расчёт в план
            </Button>
          </div>
          <div className="thin-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-surface text-left text-xs text-ink/70">
                <tr>
                  <th className="px-3 py-2 font-medium">Позиция</th>
                  <th className="w-40 px-2 py-2 text-right font-medium">Стоимость 1 ед.</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">План, шт.</th>
                  <th className="w-40 px-2 py-2 text-right font-medium">Сумма по плану</th>
                  <th className="w-28 bg-brand-light/60 px-2 py-2 text-right font-medium">
                    Для цели, шт.
                  </th>
                  <th className="w-40 bg-brand-light/60 px-3 py-2 text-right font-medium">
                    Сумма для цели
                  </th>
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
                      tintFrom={3}
                      cells={[
                        null,
                        formatQty(list.reduce((s, i) => s + i.planQty, 0)),
                        formatRub(incomeSum(list, 'planQty')),
                        formatQty(list.reduce((s, i) => s + forecast[i.key], 0)),
                        formatRub(list.reduce((s, i) => s + i.price * forecast[i.key], 0)),
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
                            <td className="bg-brand-light/30 px-2 py-1.5 text-right tabular-nums">
                              {formatQty(forecast[d.key])}
                            </td>
                            <td className="bg-brand-light/30 px-3 py-1.5 text-right tabular-nums">
                              {formatRub(it.price * forecast[d.key])}
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
                  <td className="bg-brand-light/30" />
                  <td className="bg-brand-light/30 px-3 py-2.5 text-right tabular-nums">
                    {formatRub(forecastSum)}
                  </td>
                </tr>
                <tr className="border-t border-line text-ink/70">
                  <td className="px-3 py-2" colSpan={3}>
                    Цель: расходы {formatRub(expenses)} + {Math.round(INCOME_MARGIN * 100)}%
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatRub(target)}</td>
                  <td className="bg-brand-light/30" />
                  <td className="bg-brand-light/30 px-3 py-2 text-right tabular-nums">
                    {formatRub(target)}
                  </td>
                </tr>
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

function SummaryCard({
  label,
  value,
  note,
  active,
  testId,
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
  active?: boolean;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-white px-4 py-3',
        active ? 'border-brand' : 'border-line',
      )}
    >
      <div className="text-xs text-ink/60">{label}</div>
      <div className="text-xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </div>
      {note && <div className="text-xs text-ink/60">{note}</div>}
    </div>
  );
}

function GroupRow({
  group: g,
  open,
  onToggle,
  cells,
  tintFrom = Infinity,
}: {
  group: IncomeGroup;
  open: boolean;
  onToggle: () => void;
  cells: React.ReactNode[];
  /** С какого столбца (индекс в cells) — подсветка калькулятора */
  tintFrom?: number;
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
            i >= tintFrom && 'bg-brand-light/30',
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

/** Число, редактируемое по клику (стоимость или количество). */
function NumberCell({
  value,
  format,
  label,
  onCommit,
  testId,
}: {
  value: number;
  format: (n: number) => string;
  label: string;
  onCommit: (n: number) => void;
  testId: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const commit = () => {
    setEditing(false);
    if (!draft.trim()) return;
    const n = Math.round(Number(draft.replace(/шт\.?|[\s  ₽]/g, '').replace(',', '.')));
    if (!Number.isFinite(n) || n < 0) return;
    if (n !== value) onCommit(n);
  };
  if (editing) {
    return (
      <input
        autoFocus
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="h-7 w-full rounded border border-brand bg-white px-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/20"
        aria-label={label}
        data-testid={`${testId}-input`}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className={cn(
        'w-full whitespace-nowrap rounded px-1 py-0.5 text-right tabular-nums hover:bg-brand-light',
        value ? 'text-ink' : 'text-status-gray',
      )}
      title="Изменить"
      data-testid={testId}
    >
      {format(value)}
    </button>
  );
}
