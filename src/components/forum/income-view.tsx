'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { NumberCell } from '@/components/ui/number-cell';
import { Spinner } from '@/components/ui/spinner';
import { TabGroup, TabLink } from '@/components/ui/tab-links';
import {
  INCOME_GROUPS,
  INCOME_ITEMS,
  INCOME_MARGIN,
  autoPlan,
  incomeLevel,
  incomeSum,
  incomeTarget,
  planAdvice,
  type IncomeGroup,
  type IncomeLevel,
  type IncomeItemValue,
} from '@/lib/income';
import { cn, formatRub, formatRubShort, markerLabels } from '@/lib/utils';
import { addIncomeItem, removeIncomeItem, saveIncomeItems } from '@/server/actions/income';
import type { ActionResult } from '@/server/action-utils';
import { useForum } from './forum-context';

type Patch = { key: string } & Partial<Omit<IncomeItemValue, 'key' | 'group'>> & {
    removed?: false;
  };

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
  // План с автоподбором под цель: ручные позиции как есть, остальные добирают до цели
  const planned = React.useMemo(() => autoPlan(items, target), [items, target]);
  const planSum = incomeSum(planned, 'planQty');
  const factSum = incomeSum(planned, 'factQty');
  const confirm = useConfirm();
  const removedDefaults = INCOME_ITEMS.filter((d) => !items.some((i) => i.key === d.key));
  const advice = planAdvice(planned, target);

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

  /** Добавление / удаление позиции: список целиком приходит с сервера */
  const apply = async (call: () => Promise<ActionResult<IncomeItemValue[]>>) => {
    setSaving(true);
    const res = await call();
    setSaving(false);
    if (res.ok) setItems(res.data);
    else toast.error(res.error);
    return res.ok;
  };
  const remove = async (it: IncomeItemValue) => {
    const ok = await confirm({
      title: `Убрать позицию «${it.label}»?`,
      description: 'Позиция исчезнет из плана и факта вместе с её количеством.',
      confirmText: 'Убрать',
      danger: true,
    });
    if (ok) await apply(() => removeIncomeItem(forum.id, it.key));
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
              Количество подбирается автоматически под цель (расходы +{' '}
              {Math.round(INCOME_MARGIN * 100)}%). Любое количество можно изменить вручную —
              остальные позиции пересчитаются, чтобы добрать до цели.
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
                const list = planned.filter((i) => i.group === g.key);
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
                      list.map((it) => {
                        return (
                          <tr
                            key={it.key}
                            className="border-t border-line/60"
                            data-testid="income-row"
                          >
                            <td className="py-1 pl-10 pr-3">
                              <LabelCell
                                item={it}
                                onRename={(label) => save([{ key: it.key, label }])}
                                onRemove={() => void remove(it)}
                              />
                            </td>
                            <td className="px-1 py-1">
                              <NumberCell
                                value={it.price}
                                format={formatRub}
                                label={`Стоимость 1 ед.: ${it.label}`}
                                onCommit={(price) => save([{ key: it.key, price }])}
                                testId={`income-price-${it.key}`}
                              />
                            </td>
                            <td className="px-1 py-1">
                              <div className="flex items-center justify-end gap-1">
                                {it.planManual ? (
                                  <button
                                    type="button"
                                    className="rounded p-1 text-ink/50 hover:bg-surface hover:text-brand"
                                    title="Вернуть автоматический подбор"
                                    aria-label={`Вернуть автоматический подбор: ${it.label}`}
                                    onClick={() => save([{ key: it.key, planManual: false }])}
                                    data-testid={`income-plan-auto-${it.key}`}
                                  >
                                    <RotateCcw className="size-3.5" />
                                  </button>
                                ) : (
                                  <span
                                    className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-ink/50"
                                    title="Подобрано автоматически под цель"
                                  >
                                    авто
                                  </span>
                                )}
                                <NumberCell
                                  value={it.planQty}
                                  format={formatQty}
                                  label={`План, шт.: ${it.label}`}
                                  onCommit={(planQty) =>
                                    save([{ key: it.key, planQty, planManual: true }])
                                  }
                                  testId={`income-plan-${it.key}`}
                                  className={cn('min-w-0 flex-1', !it.planManual && 'text-ink/60')}
                                />
                              </div>
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
                    {open && (
                      <AddItemRow
                        group={g}
                        restore={removedDefaults.filter((x) => x.group === g.key)}
                        onRestore={(key) => save([{ key, removed: false }])}
                        onAdd={(label, price) =>
                          apply(() => addIncomeItem(forum.id, { group: g.key, label, price }))
                        }
                      />
                    )}
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
          {advice.length > 0 && (
            <section
              className="mt-3 rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm"
              data-testid="income-advice"
            >
              <h3 className="flex items-center gap-2 font-semibold text-brand">
                <Lightbulb className="size-4" />
                Рекомендация по плану продаж
              </h3>
              <ul className="mt-1.5 list-disc space-y-1 pl-6 text-ink/80">
                {advice.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </section>
          )}
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
                const list = planned.filter((i) => i.group === g.key);
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
                      list.map((it) => {
                        return (
                          <tr
                            key={it.key}
                            className="border-t border-line/60"
                            data-testid="income-row"
                          >
                            <td className="py-1.5 pl-12 pr-3">{it.label}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-ink/70">
                              {formatRub(it.price)}
                            </td>
                            <td className="px-1 py-1">
                              <NumberCell
                                value={it.factQty}
                                format={formatQty}
                                label={`Продано, шт.: ${it.label}`}
                                onCommit={(factQty) => save([{ key: it.key, factQty }])}
                                testId={`income-fact-${it.key}`}
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
 * Сводка доходов над вкладками «План» / «Факт»: полоса факта продаж с отметками
 * «Расходы» и «План» — сразу видно, покрывают ли продажи расходы и выполнен ли план.
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
  // План подбирается под цель; пока его нет — ориентир цель
  const goal = plan || target;
  const max = Math.max(goal * 1.15, expenses, fact) || 1;
  const at = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const level = incomeLevel(fact, expenses, goal);
  const [expShift, planShift, twoRows] = markerLabels(expenses, plan, max);
  const note = [plan && `${pctOf(fact, plan)} от плана`, target && `${pctOf(fact, target)} от цели`]
    .filter(Boolean)
    .join(' · ');
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
        <div className="text-sm text-ink/70">
          План продаж{' '}
          <span className="tabular-nums" data-testid="income-plan-total">
            {formatRub(plan)}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[3rem_1fr] gap-x-3 gap-y-2 sm:grid-cols-[3rem_1fr_13rem]">
        <div className="self-center text-sm font-medium">Факт</div>
        <div className="relative self-center">
          <div className="h-3 w-full overflow-hidden rounded-full bg-surface">
            <div
              className={cn('h-full', LEVEL_BAR[level])}
              style={{ width: at(fact) }}
              title={`Факт: ${formatRub(fact)}`}
            />
          </div>
          {expenses > 0 && <Marker left={at(expenses)} />}
          {plan > 0 && <Marker left={at(plan)} strong />}
        </div>
        <div className="col-start-2 sm:col-start-auto">
          <div className="font-semibold tabular-nums" data-testid="income-fact-total">
            {formatRub(fact)}
          </div>
          {note && (
            <div className={cn('text-xs', goal ? LEVEL_TEXT[level] : 'text-ink/60')}>{note}</div>
          )}
        </div>
        {(expenses > 0 || plan > 0) && (
          <div
            className={cn('relative col-start-2 text-[11px] text-ink/60', twoRows ? 'h-8' : 'h-4')}
          >
            {expenses > 0 && (
              <span
                className={cn('absolute whitespace-nowrap', expShift)}
                style={{ left: at(expenses) }}
              >
                Расходы<span className="hidden sm:inline"> · {formatRubShort(expenses)}</span>
              </span>
            )}
            {plan > 0 && (
              <span
                className={cn('absolute whitespace-nowrap font-medium text-ink', planShift)}
                style={{ left: at(plan) }}
              >
                План<span className="hidden sm:inline"> · {formatRubShort(plan)}</span>
              </span>
            )}
          </div>
        )}
      </div>
      {goal > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/70">
          <Legend className="bg-status-red" label="Не покрывает расходы" />
          <Legend className="bg-brand" label="Расходы покрыты" />
          <Legend className="bg-status-green" label="План выполнен" />
        </div>
      )}
    </section>
  );
}

function Marker({ left, strong }: { left: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        'absolute -inset-y-1 w-0 border-l',
        strong ? 'border-ink/70' : 'border-dashed border-ink/40',
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

/** Название позиции: переименование по карандашу или двойному клику, удаление по корзине. */
function LabelCell({
  item,
  onRename,
  onRemove,
}: {
  item: IncomeItemValue;
  onRename: (label: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(item.label);
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== item.label) onRename(v);
  };
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        maxLength={120}
        className="h-7 w-full max-w-md rounded border border-brand bg-white px-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
        aria-label="Название позиции"
        data-testid={`income-label-${item.key}-input`}
      />
    );
  }
  const start = () => {
    setDraft(item.label);
    setEditing(true);
  };
  return (
    <div className="group flex items-center gap-1">
      <span className="px-2 py-0.5" onDoubleClick={start} data-testid={`income-label-${item.key}`}>
        {item.label}
      </span>
      <button
        type="button"
        className="rounded p-1 text-ink/40 opacity-0 hover:bg-surface hover:text-brand focus-visible:opacity-100 group-hover:opacity-100"
        title="Переименовать"
        aria-label={`Переименовать: ${item.label}`}
        onClick={start}
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        type="button"
        className="rounded p-1 text-ink/40 opacity-0 hover:bg-surface hover:text-status-red focus-visible:opacity-100 group-hover:opacity-100"
        title="Убрать позицию"
        aria-label={`Убрать позицию: ${item.label}`}
        onClick={onRemove}
        data-testid={`income-remove-${item.key}`}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

/** Строка «+ Добавить позицию» в конце группы; там же — возврат убранных позиций по умолчанию. */
function AddItemRow({
  group,
  restore,
  onRestore,
  onAdd,
}: {
  group: IncomeGroup;
  restore: { key: string; label: string }[];
  onRestore: (key: string) => void;
  onAdd: (label: string, price: number) => Promise<boolean>;
}) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState('');
  const [price, setPrice] = React.useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = label.trim();
    const n = Math.round(Number(price.replace(/[\s  ₽]/g, '').replace(',', '.')) || 0);
    if (!name) return;
    if (await onAdd(name, Math.max(0, n))) {
      setLabel('');
      setPrice('');
      setOpen(false);
    }
  };
  return (
    <tr className="border-t border-line/60">
      <td colSpan={5} className="py-1.5 pl-12 pr-3">
        {open ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={submit}>
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Название позиции"
              maxLength={120}
              className="h-8 w-64 rounded border border-line px-2 text-sm focus:border-brand focus:outline-none"
              aria-label="Название новой позиции"
              data-testid={`income-add-label-${group.key}`}
            />
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
              placeholder="Стоимость 1 ед., ₽"
              className="h-8 w-44 rounded border border-line px-2 text-right text-sm tabular-nums focus:border-brand focus:outline-none"
              aria-label="Стоимость одной единицы"
              data-testid={`income-add-price-${group.key}`}
            />
            <button
              type="submit"
              className="h-8 rounded bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90"
              data-testid={`income-add-submit-${group.key}`}
            >
              Добавить
            </button>
            <button
              type="button"
              className="h-8 rounded px-2 text-sm text-ink/70 hover:bg-surface"
              onClick={() => setOpen(false)}
            >
              Отмена
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-brand hover:bg-brand-light"
              onClick={() => setOpen(true)}
              data-testid={`income-add-${group.key}`}
            >
              <Plus className="size-4" />
              Добавить позицию
            </button>
            {restore.map((r) => (
              <button
                key={r.key}
                type="button"
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-ink/60 hover:bg-surface hover:text-ink"
                onClick={() => onRestore(r.key)}
                title="Вернуть позицию по умолчанию"
              >
                <RotateCcw className="size-3" />
                Вернуть «{r.label}»
              </button>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}
