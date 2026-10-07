'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Lightbulb, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { NumberCell } from '@/components/ui/number-cell';
import { Spinner } from '@/components/ui/spinner';
import { TabGroup, TabLink } from '@/components/ui/tab-links';
import { formatDate } from '@/lib/dates';
import type { DealValue } from '@/lib/funnel';
import {
  INCOME_GROUPS,
  INCOME_ITEMS,
  INCOME_MARGIN,
  PRICE_STAGES,
  autoPlan,
  currentStage,
  hasStages,
  incomeSum,
  incomeTarget,
  itemSum,
  netPrice,
  salesAdvice,
  stageDates,
  type IncomeConfig,
  type IncomeGroup,
  type IncomeItemValue,
  type Triple,
  withDeals,
  withValues,
} from '@/lib/income';
import { cn, formatRub } from '@/lib/utils';
import {
  addIncomeItem,
  removeIncomeItem,
  saveIncomeConfig,
  saveIncomeItems,
} from '@/server/actions/income';
import type { ActionResult } from '@/server/action-utils';
import { DealsInFact } from './deals-in-fact';
import { useForum } from './forum-context';

type ItemPatch = {
  key: string;
  label?: string;
  price?: number;
  discount?: number;
  planQty?: number;
  factQty?: number;
  stage?: number;
  planManual?: boolean;
  removed?: false;
};

type View = 'plan' | 'fact';

const pctOf = (part: number, total: number) =>
  total ? `${Math.round((part / total) * 100).toLocaleString('ru-RU')}%` : '—';
const formatQty = (n: number) => `${n.toLocaleString('ru-RU').replace(/ | /g, ' ')} шт.`;
const formatPct = (n: number) => `${n.toLocaleString('ru-RU')}%`;
const qtyOf = (t: Triple) => t[0] + t[1] + t[2];

/** Оптимистичное применение правки */
function applyPatch(i: IncomeItemValue, p: ItemPatch): IncomeItemValue {
  const n = withValues(i, p);
  if (p.label !== undefined) n.label = p.label;
  if (p.planManual !== undefined) n.planManual = p.planManual;
  return n;
}

export function IncomeView({
  initialItems,
  initialConfig,
  initialDeals,
}: {
  initialItems: IncomeItemValue[];
  initialConfig: IncomeConfig;
  /** Оплаченные сделки воронки — сами входят в факт */
  initialDeals: DealValue[];
}) {
  const { forum, tasks, today } = useForum();
  const sp = useSearchParams();
  const view: View = sp.get('view') === 'fact' ? 'fact' : 'plan';
  const [items, setItems] = React.useState(initialItems);
  const [cfg, setCfg] = React.useState(initialConfig);
  const [deals, setDeals] = React.useState(initialDeals);
  const [saving, setSaving] = React.useState(false);
  const dates = React.useMemo(
    () => stageDates(cfg, forum.salesStartDate, forum.startDate),
    [cfg, forum.salesStartDate, forum.startDate],
  );
  const stageNow = currentStage(dates, today);

  const expenses = tasks.reduce((s, t) => s + t.cost, 0);
  const target = incomeTarget(expenses);
  // Факт = введённое вручную + оплаченные сделки воронки; план с автоподбором под цель
  const planned = React.useMemo(
    () => autoPlan(withDeals(items, deals, dates, today), target, stageNow),
    [items, deals, dates, today, target, stageNow],
  );
  // В плане — только плановые статьи; в факте — ещё и статьи только для факта
  const shown = view === 'plan' ? planned.filter((i) => !i.factOnly) : planned;
  const partners = shown.filter((i) => !hasStages(i));
  const tickets = shown.filter(hasStages);
  const planSum = incomeSum(planned, 'plan');
  const factSum = incomeSum(planned, 'fact');
  const confirm = useConfirm();
  const removedDefaults = INCOME_ITEMS.filter((d) => !items.some((i) => i.key === d.key));
  const todayAdvice = salesAdvice(planned, target, dates, forum.startDate, today);

  const save = async (patches: ItemPatch[]) => {
    const prev = items;
    setItems((list) =>
      list.map((i) => {
        const p = patches.find((x) => x.key === i.key);
        return p ? applyPatch(i, p) : i;
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

  const saveConfig = async (patch: Partial<IncomeConfig>) => {
    const prev = cfg;
    setCfg({ ...cfg, ...patch });
    setSaving(true);
    const res = await saveIncomeConfig(forum.id, patch);
    setSaving(false);
    if (res.ok) setCfg(res.data);
    else {
      setCfg(prev);
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
      description: it.factOnly
        ? 'Статья исчезнет из факта вместе с её продажами.'
        : 'Позиция исчезнет из плана и факта вместе с её количеством.',
      confirmText: 'Убрать',
      danger: true,
    });
    if (ok) await apply(() => removeIncomeItem(forum.id, it.key));
  };

  const base = `/forums/${forum.id}/income`;
  const planGap = target - planSum;
  const sumOf = (list: IncomeItemValue[], stage: number | null = null) =>
    incomeSum(list, view, stage);
  const allTickets = planned.filter(hasStages);
  const rowProps = (it: IncomeItemValue) => ({
    item: it,
    view,
    total: planSum,
    onSave: save,
    onAuto: () => save([{ key: it.key, planManual: false }]),
    onRemove: () => void remove(it),
  });
  // «Добавить статью» — справа над таблицей; форма открывается между заголовком и таблицей
  const [adding, setAdding] = React.useState<string | null>(null);
  const factOnly = view === 'fact';
  const addActions = (g: IncomeGroup) => (
    <AddItemActions
      group={g}
      factOnly={factOnly}
      restore={factOnly ? [] : removedDefaults.filter((x) => x.group === g.key)}
      onRestore={(key) => save([{ key, removed: false }])}
      onOpen={() => setAdding(g.key)}
    />
  );
  const addForm = (g: IncomeGroup) =>
    adding === g.key && (
      <AddItemForm
        key={`${g.key}-${view}`}
        group={g}
        stage={stageNow}
        factOnly={factOnly}
        onCancel={() => setAdding(null)}
        onAdd={async (v) => {
          const ok = await apply(() =>
            addIncomeItem(forum.id, { group: g.key, ...v, ...(factOnly && { factOnly: true }) }),
          );
          if (ok) setAdding(null);
          return ok;
        }}
      />
    );
  const [gPartners, gTickets] = INCOME_GROUPS;
  /** Столбцов в таблицах статей и итогов — одинаково, чтобы суммы стояли друг под другом */
  const cols = view === 'plan' ? 8 : 10;

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

      {view === 'fact' && (
        <DealsInFact
          forumId={forum.id}
          deals={deals}
          setDeals={setDeals}
          items={items}
          dates={dates}
          today={today}
        />
      )}

      {todayAdvice.length > 0 && (
        <section
          className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm"
          data-testid="income-today-advice"
        >
          <h3 className="flex items-center gap-2 font-semibold text-amber-900">
            <Lightbulb className="size-4" />
            Рекомендация на сегодня, {formatDate(today)}
          </h3>
          <p className="mt-1 text-ink/80">{todayAdvice.join(' ')}</p>
        </section>
      )}

      {/* Партнёрства: без стадий продаж */}
      <SectionTitle
        group={gPartners}
        note="Стадий продаж нет; скидка — индивидуальная для статьи"
        sum={sumOf(partners)}
        plan={view === 'fact' ? incomeSum(partners, 'plan') : undefined}
        actions={addActions(gPartners)}
      />
      {addForm(gPartners)}
      <div className="thin-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-white">
        <table className={tableClass} data-testid="income-group-partners">
          <Cols view={view} />
          <ItemsHead view={view} />
          <tbody>
            {partners.map((it) => (
              <ItemRow key={it.key} {...rowProps(it)} />
            ))}
            {partners.length === 0 && (
              <tr className="border-t border-line/60">
                <td colSpan={cols} className="py-1.5 pl-6 text-xs text-ink/50">
                  Нет статей
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Билеты: у каждой статьи своя стадия продаж */}
      <SectionTitle
        group={gTickets}
        note="У каждой статьи своя стадия продаж, цена и скидка"
        sum={sumOf(tickets)}
        plan={view === 'fact' ? incomeSum(tickets, 'plan') : undefined}
        actions={addActions(gTickets)}
      />
      <StageDates
        dates={dates}
        current={stageNow}
        forumStart={forum.startDate}
        onSave={saveConfig}
      />
      {addForm(gTickets)}
      <div className="thin-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-white">
        <table className={tableClass} data-testid="income-group-tickets">
          <Cols view={view} />
          <ItemsHead view={view} withStage />
          {PRICE_STAGES.map((st, k) => {
            const rows = tickets.filter((i) => i.stage === k);
            return (
              <tbody key={st.key} data-testid={`income-stage-${st.key}`}>
                <tr className="border-t border-line bg-surface/50">
                  <td className="px-3 py-1.5" colSpan={6}>
                    <span className="font-medium">{st.label}</span>
                    <span className="ml-2 text-xs text-ink/60">
                      {formatDate(dates[k])} – {formatDate(k < 2 ? dates[k + 1] : forum.startDate)}
                    </span>
                    {k === stageNow && (
                      <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-[10px] font-medium text-white">
                        сейчас
                      </span>
                    )}
                    {k < stageNow && (
                      <span className="ml-2 text-[10px] text-ink/50">завершена</span>
                    )}
                  </td>
                  <td
                    className="px-2 py-1.5 text-right font-medium tabular-nums"
                    data-testid={`income-stage-sum-${st.key}`}
                  >
                    {formatRub(sumOf(rows))}
                  </td>
                  <td colSpan={view === 'plan' ? 1 : 3} className="px-3 py-1.5 text-xs text-ink/60">
                    {view === 'fact' ? (
                      <span className="flex items-center gap-2">
                        из {formatRub(incomeSum(rows, 'plan'))}
                      </span>
                    ) : null}
                  </td>
                </tr>
                {rows.length === 0 && (
                  <tr className="border-t border-line/60">
                    <td colSpan={cols} className="py-1.5 pl-6 text-xs text-ink/50">
                      Нет статей на этой стадии
                    </td>
                  </tr>
                )}
                {rows.map((it) => (
                  <ItemRow key={it.key} {...rowProps(it)} withStage />
                ))}
              </tbody>
            );
          })}
        </table>
      </div>

      {/* Итог: партнёрства + билеты по стадиям */}
      <div className="mt-6 flex items-baseline gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="h-4 w-1.5 rounded-sm bg-ink/70" />
          Итого
        </h2>
        <span className="text-xs text-ink/50">Партнёрства и билеты по стадиям</span>
      </div>
      <div className="thin-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-white">
        <table className={tableClass} data-testid="income-totals">
          <Cols view={view} />
          <tbody>
            <TotalRow
              view={view}
              label="Партнёрства"
              value={sumOf(partners)}
              plan={view === 'fact' ? incomeSum(partners, 'plan') : undefined}
            />
            {PRICE_STAGES.map((st, k) => (
              <TotalRow
                view={view}
                key={st.key}
                label={`Билеты · ${st.label}`}
                value={sumOf(allTickets, k)}
                plan={view === 'fact' ? incomeSum(allTickets, 'plan', k) : undefined}
                indent
              />
            ))}
            <TotalRow
              view={view}
              label="Билеты, все стадии"
              value={sumOf(allTickets)}
              plan={view === 'fact' ? incomeSum(allTickets, 'plan') : undefined}
            />
            <TotalRow
              view={view}
              label={
                view === 'plan' ? 'Итого план с учётом скидок' : 'Итого продано с учётом скидок'
              }
              value={view === 'plan' ? planSum : factSum}
              plan={view === 'fact' ? planSum : undefined}
              strong
              testId={view === 'plan' ? 'income-plan-net' : 'income-fact-net'}
            />
            <TotalRow
              view={view}
              label={`Цель: расходы ${formatRub(expenses)} + ${Math.round(INCOME_MARGIN * 100)}%`}
              value={target}
              muted
            />
            {view === 'plan' && target > 0 && (
              <tr className="border-t border-line">
                <td className="px-3 py-2" colSpan={6}>
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
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionTitle({
  group,
  note,
  sum,
  plan,
  actions,
}: {
  group: IncomeGroup;
  note: string;
  sum: number;
  plan?: number;
  /** Кнопки справа над таблицей */
  actions?: React.ReactNode;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="flex items-center gap-2 font-semibold">
        <span className="h-4 w-1.5 rounded-sm" style={{ background: group.color }} />
        {group.label}
      </h2>
      <span className="font-semibold tabular-nums">{formatRub(sum)}</span>
      {plan !== undefined && (
        <span className="text-sm text-ink/60">
          из {formatRub(plan)} · {pctOf(sum, plan)}
        </span>
      )}
      <span className="text-xs text-ink/50">{note}</span>
      {actions && <div className="ml-auto self-center">{actions}</div>}
    </div>
  );
}

function TotalRow({
  view,
  label,
  value,
  plan,
  strong,
  muted,
  indent,
  testId,
}: {
  view: View;
  label: string;
  value: number;
  /** В факте — план для сравнения */
  plan?: number;
  strong?: boolean;
  muted?: boolean;
  indent?: boolean;
  testId?: string;
}) {
  return (
    <tr
      className={cn(
        'border-t border-line first:border-t-0',
        strong && 'font-semibold',
        muted && 'text-ink/70',
        indent && 'text-ink/80',
      )}
    >
      {/* Сумма — в столбце «Сумма по плану» / «Выручка» таблиц статей выше */}
      <td className={cn('px-3 py-2', indent && 'pl-8')} colSpan={6}>
        {label}
      </td>
      <td className="px-2 py-2 text-right tabular-nums" data-testid={testId}>
        {formatRub(value)}
      </td>
      <td className="px-3 py-2" colSpan={view === 'plan' ? 1 : 3}>
        {plan !== undefined && (
          <div className="flex items-center gap-3 text-xs font-normal text-ink/60">
            <span className="w-28 text-right tabular-nums">из {formatRub(plan)}</span>
            <div className="flex-1">
              <Progress part={value} total={plan} />
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

const th = 'px-2 py-2 text-right font-medium';
const tableClass = 'w-full min-w-[1150px] table-fixed text-sm';

/** Ширины столбцов — общие для всех таблиц «Доходов» */
const COL_WIDTHS: Record<View, (number | undefined)[]> = {
  plan: [undefined, 176, 144, 96, 144, 128, 160, 80],
  fact: [undefined, 176, 144, 96, 144, 128, 144, 112, 144, 160],
};

function Cols({ view }: { view: View }) {
  return (
    <colgroup>
      {COL_WIDTHS[view].map((w, i) => (
        <col key={i} style={w ? { width: w } : undefined} />
      ))}
    </colgroup>
  );
}

function ItemsHead({ view, withStage }: { view: View; withStage?: boolean }) {
  return (
    <thead className="bg-surface text-left text-xs text-ink/70">
      <tr>
        <th className="px-3 py-2 font-medium" colSpan={withStage ? 1 : 2}>
          Статья
        </th>
        {withStage && <th className="px-2 py-2 font-medium">Стадия</th>}
        <th className={th}>Цена 1 ед.</th>
        <th className={th}>Скидка</th>
        <th className={th}>Цена со скидкой</th>
        {view === 'plan' ? (
          <>
            <th className={th}>План, шт.</th>
            <th className={th}>Сумма по плану</th>
            <th className={cn(th, 'px-3')}>Доля</th>
          </>
        ) : (
          <>
            <th className={th}>Продано, шт.</th>
            <th className={th}>Выручка</th>
            <th className={th}>План, шт.</th>
            <th className={th}>План, ₽</th>
            <th className={cn(th, 'px-3')}>Выполнение плана</th>
          </>
        )}
      </tr>
    </thead>
  );
}

/**
 * Строка статьи. В плане правятся условия (стадия, цена, скидка) и количество; в факте —
 * продано, название и условия статей только для факта.
 */
function ItemRow({
  item: it,
  view,
  withStage,
  total,
  onSave,
  onAuto,
  onRemove,
}: {
  item: IncomeItemValue;
  view: View;
  withStage?: boolean;
  total: number;
  onSave: (p: ItemPatch[]) => void;
  onAuto: () => void;
  onRemove: () => void;
}) {
  const k = it.stage;
  // Строка только для сделок воронки не редактируется: её нет в базе
  const editTerms = view === 'plan' || (it.factOnly && !it.fromDeals);
  const plan = itemSum(it, 'plan', null);
  const fact = itemSum(it, 'fact', null);
  const sold = qtyOf(it.fact) + it.deals.qty;
  // В факте сделки воронки идут по своим суммам: скидки у клиентов разные, общей нет
  const byDeals = view === 'fact' && it.deals.count > 0;
  const discount = it.discounts[k];
  const muted = 'px-2 py-1.5 text-right tabular-nums text-ink/70';
  return (
    <tr className="border-t border-line/60" data-testid="income-row">
      <td className="py-1 pl-4 pr-3" colSpan={withStage ? 1 : 2}>
        <LabelCell
          item={it}
          onRename={(label) => onSave([{ key: it.key, label }])}
          onRemove={editTerms ? onRemove : undefined}
        />
      </td>
      {withStage && (
        <td className="px-1 py-1">
          {editTerms ? (
            <select
              value={k}
              onChange={(e) => onSave([{ key: it.key, stage: Number(e.target.value) }])}
              className="h-7 w-full rounded border border-transparent bg-transparent px-1 text-sm hover:border-line focus:border-brand focus:outline-none"
              aria-label={`Стадия: ${it.label}`}
              data-testid={`income-stage-select-${it.key}`}
            >
              {PRICE_STAGES.map((st, s) => (
                <option key={st.key} value={s}>
                  {st.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="px-1 text-ink/70">{PRICE_STAGES[k].label}</span>
          )}
        </td>
      )}
      <td className={editTerms ? 'px-1 py-1' : muted}>
        {editTerms ? (
          <NumberCell
            value={it.prices[k]}
            format={formatRub}
            label={`Цена 1 ед.: ${it.label}`}
            onCommit={(v) => onSave([{ key: it.key, price: v }])}
            testId={`income-price-${it.key}`}
          />
        ) : (
          formatRub(it.prices[k])
        )}
      </td>
      <td className={editTerms ? 'px-1 py-1' : muted}>
        {editTerms ? (
          <NumberCell
            value={it.discounts[k]}
            format={(v) => (v ? formatPct(v) : '—')}
            label={`Скидка, %: ${it.label}`}
            onCommit={(v) => onSave([{ key: it.key, discount: Math.min(100, v) }])}
            testId={`income-discount-${it.key}`}
          />
        ) : byDeals ? (
          <span
            className="text-xs"
            title="Выручка — сумма оплаченных сделок, у каждого клиента своя скидка"
          >
            по сделкам
          </span>
        ) : discount ? (
          formatPct(discount)
        ) : (
          '—'
        )}
      </td>
      <td
        className={cn(
          'px-2 py-1.5 text-right tabular-nums',
          discount && !byDeals ? 'text-ink' : 'text-ink/50',
        )}
      >
        {byDeals ? '—' : formatRub(netPrice(it, k))}
      </td>
      {view === 'plan' ? (
        <>
          <td className="px-1 py-1">
            <div className="flex items-center justify-end gap-1">
              <AutoBadge item={it} onAuto={onAuto} />
              <NumberCell
                value={qtyOf(it.plan)}
                format={formatQty}
                label={`План, шт.: ${it.label}`}
                onCommit={(v) => onSave([{ key: it.key, planQty: v, planManual: true }])}
                testId={`income-plan-${it.key}`}
                className={cn('min-w-0 flex-1', !it.planManual && 'text-ink/60')}
              />
            </div>
          </td>
          <td className="px-2 py-1.5 text-right tabular-nums">{formatRub(plan)}</td>
          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-ink/60">
            {plan ? pctOf(plan, total) : ''}
          </td>
        </>
      ) : (
        <>
          <td className="px-1 py-1">
            {it.fromDeals ? (
              <div className="px-2 py-1.5 text-right tabular-nums">{formatQty(sold)}</div>
            ) : (
              <NumberCell
                value={sold}
                format={formatQty}
                label={`Продано, шт.: ${it.label}`}
                onCommit={(v) => onSave([{ key: it.key, factQty: Math.max(0, v - it.deals.qty) }])}
                testId={`income-fact-${it.key}`}
              />
            )}
            {it.deals.count > 0 && (
              <div
                className="pr-2 text-right text-[10px] text-ink/50"
                title="Оплаченные сделки воронки и проданное, внесённое вручную"
              >
                из воронки {it.deals.qty}
                {sold > it.deals.qty && ` · вручную ${sold - it.deals.qty}`}
              </div>
            )}
          </td>
          <td className="px-2 py-1.5 text-right tabular-nums">{formatRub(fact)}</td>
          {it.factOnly ? (
            <td colSpan={3} className="px-3 py-1.5 text-right text-xs text-ink/50">
              {it.fromDeals ? 'нет статьи на этой стадии' : 'нет в плане'}
            </td>
          ) : (
            <>
              <td className={muted}>{formatQty(qtyOf(it.plan))}</td>
              <td className={muted}>{formatRub(plan)}</td>
              <td className="px-3 py-1.5">
                <Progress part={fact} total={plan} />
              </td>
            </>
          )}
        </>
      )}
    </tr>
  );
}

function AutoBadge({ item: it, onAuto }: { item: IncomeItemValue; onAuto: () => void }) {
  return it.planManual ? (
    <button
      type="button"
      className="rounded p-1 text-ink/50 hover:bg-surface hover:text-brand"
      title="Вернуть автоматический подбор"
      aria-label={`Вернуть автоматический подбор: ${it.label}`}
      onClick={onAuto}
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
  );
}

/** Даты стадий продаж билетов: старт — из карточки форума, «Середину» и «Финал» можно сдвинуть */
function StageDates({
  dates,
  current,
  forumStart,
  onSave,
}: {
  dates: [string, string, string];
  current: number;
  forumStart: string;
  onSave: (patch: Partial<IncomeConfig>) => void;
}) {
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/70"
      data-testid="income-stage-dates"
    >
      <span>Стадии продаж:</span>
      {PRICE_STAGES.map((st, k) => (
        <span key={st.key} className="inline-flex items-center gap-1">
          <span className={cn(k === current && 'font-medium text-brand')}>{st.label}</span>с
          {k === 0 ? (
            <span title="Дата старта продаж задаётся в карточке форума">
              {formatDate(dates[0])}
            </span>
          ) : (
            <input
              type="date"
              value={dates[k]}
              min={dates[k - 1]}
              max={forumStart}
              onChange={(e) =>
                e.target.value &&
                onSave(k === 1 ? { midDate: e.target.value } : { finalDate: e.target.value })
              }
              className="h-6 rounded border border-line bg-white px-1 text-xs tabular-nums focus:border-brand focus:outline-none"
              aria-label={`Дата начала стадии «${st.label}»`}
              data-testid={`income-stage-date-${st.key}`}
            />
          )}
        </span>
      ))}
      <span>до форума {formatDate(forumStart)}</span>
    </div>
  );
}

/**
 * Шапка «Доходов» по образцу «Расходов»: план продаж и фактические доходы,
 * под фактом — шкала выполнения плана, процент и сколько осталось продать.
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
  const done = plan > 0 && fact >= plan;
  const covered = expenses > 0 && fact >= expenses;
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-3" data-testid="income-summary">
      <div className="min-w-[220px]">
        <div className="text-xs text-ink/60">План продаж</div>
        <div
          className="text-2xl font-semibold tabular-nums leading-8"
          data-testid="income-plan-total"
        >
          {formatRub(plan)}
        </div>
        <div className="text-xs text-ink/60" data-testid="income-target">
          {expenses ? (
            <>
              Цель {formatRub(target)}: расходы{' '}
              <Link href={`/forums/${forumId}/expenses`} className="text-brand hover:underline">
                {formatRub(expenses)}
              </Link>{' '}
              + {Math.round(INCOME_MARGIN * 100)}%
            </>
          ) : (
            'Заполните стоимость задач в «Расходах», чтобы появилась цель'
          )}
        </div>
      </div>
      <div className="min-w-[260px]">
        <div className="text-xs text-ink/60">Фактические доходы</div>
        <div
          className={cn(
            'text-2xl font-semibold tabular-nums leading-8',
            done && 'text-status-green',
          )}
          data-testid="income-fact-total"
        >
          {formatRub(fact)}
        </div>
        {plan > 0 && (
          <>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface">
              <div
                className={cn('h-full', done ? 'bg-status-green' : 'bg-brand')}
                style={{ width: `${Math.min(100, (fact / plan) * 100)}%` }}
              />
            </div>
            <div className={cn('mt-0.5 text-xs', done ? 'text-status-green' : 'text-ink/60')}>
              {done
                ? `План выполнен${fact > plan ? `, сверх плана ${formatRub(fact - plan)}` : ''}`
                : `Осталось ${formatRub(plan - fact)} · ${pctOne(fact, plan)} от плана`}
            </div>
            {expenses > 0 && (
              <div className={cn('text-xs', covered ? 'text-ink/60' : 'text-status-red')}>
                {covered ? 'Расходы покрыты' : `До покрытия расходов ${formatRub(expenses - fact)}`}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const pctOne = (part: number, total: number) =>
  `${((part / total) * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;

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
  /** Без него позицию убрать нельзя (плановая статья во вкладке «Факт») */
  onRemove?: () => void;
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
  if (item.fromDeals) {
    return (
      <span className="px-2 py-0.5" data-testid={`income-label-${item.key}`}>
        {item.label}
      </span>
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
      {item.factOnly && (
        <span
          className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900"
          title="Статья только для факта: в плане её нет"
        >
          факт
        </span>
      )}
      <button
        type="button"
        className="rounded p-1 text-ink/40 opacity-0 hover:bg-surface hover:text-brand focus-visible:opacity-100 group-hover:opacity-100"
        title="Переименовать"
        aria-label={`Переименовать: ${item.label}`}
        onClick={start}
      >
        <Pencil className="size-3.5" />
      </button>
      {onRemove && (
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
      )}
    </div>
  );
}

/** «+ Добавить статью» справа над таблицей; там же — возврат убранных позиций по умолчанию. */
function AddItemActions({
  group,
  factOnly,
  restore,
  onRestore,
  onOpen,
}: {
  group: IncomeGroup;
  factOnly: boolean;
  restore: { key: string; label: string }[];
  onRestore: (key: string) => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm">
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
      <Button
        size="sm"
        variant="outline"
        onClick={onOpen}
        title={
          factOnly ? 'Например, продажа с индивидуальной скидкой — в плане её не будет' : undefined
        }
        data-testid={`income-add-${group.key}`}
      >
        <Plus className="size-4" />
        {factOnly ? 'Добавить статью факта' : 'Добавить статью'}
      </Button>
    </div>
  );
}

/** Форма новой статьи — между заголовком группы и таблицей */
function AddItemForm({
  group,
  onAdd,
  onCancel,
  factOnly,
  stage: initialStage,
}: {
  group: IncomeGroup;
  onAdd: (v: { label: string; price: number; discount: number; stage: number }) => Promise<boolean>;
  onCancel: () => void;
  /** Стадия по умолчанию для нового билета — текущая */
  stage: number;
  /** Статья только для факта: со скидкой, без плана */
  factOnly?: boolean;
}) {
  const [label, setLabel] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [discount, setDiscount] = React.useState('');
  const [stage, setStage] = React.useState(initialStage);
  const withStage = group.key === 'tickets';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = label.trim();
    const n = Math.round(Number(price.replace(/[\s  ₽]/g, '').replace(',', '.')) || 0);
    if (!name) return;
    const d = Number(discount.replace(/[\s%]/g, '').replace(',', '.')) || 0;
    await onAdd({
      label: name,
      price: Math.max(0, n),
      discount: Math.min(100, Math.max(0, d)),
      stage: withStage ? stage : 0,
    });
  };
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand-light/40 px-3 py-2"
      onSubmit={submit}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={factOnly ? 'Название статьи факта' : 'Название статьи'}
        maxLength={120}
        className="h-8 w-64 rounded border border-line bg-white px-2 text-sm focus:border-brand focus:outline-none"
        aria-label="Название новой статьи"
        data-testid={`income-add-label-${group.key}`}
      />
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        inputMode="numeric"
        placeholder="Стоимость 1 ед., ₽"
        className="h-8 w-44 rounded border border-line bg-white px-2 text-right text-sm tabular-nums focus:border-brand focus:outline-none"
        aria-label="Стоимость одной единицы"
        data-testid={`income-add-price-${group.key}`}
      />
      {withStage && (
        <select
          value={stage}
          onChange={(e) => setStage(Number(e.target.value))}
          className="h-8 rounded border border-line bg-white px-2 text-sm focus:border-brand focus:outline-none"
          aria-label="Стадия продаж"
          data-testid={`income-add-stage-${group.key}`}
        >
          {PRICE_STAGES.map((st, k) => (
            <option key={st.key} value={k}>
              {st.label}
            </option>
          ))}
        </select>
      )}
      <input
        value={discount}
        onChange={(e) => setDiscount(e.target.value)}
        inputMode="decimal"
        placeholder="Скидка, %"
        className="h-8 w-28 rounded border border-line bg-white px-2 text-right text-sm tabular-nums focus:border-brand focus:outline-none"
        aria-label="Скидка, %"
        data-testid={`income-add-discount-${group.key}`}
      />
      <Button type="submit" size="sm" data-testid={`income-add-submit-${group.key}`}>
        Добавить
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Отмена
      </Button>
      {factOnly && (
        <span className="text-xs text-ink/50">
          например, продажа с индивидуальной скидкой — в плане её не будет
        </span>
      )}
    </form>
  );
}
