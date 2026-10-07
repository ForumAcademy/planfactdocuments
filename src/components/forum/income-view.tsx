'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Lightbulb, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
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
  planAdvice,
  salesAdvice,
  stageDates,
  type IncomeConfig,
  type IncomeGroup,
  type IncomeItemValue,
  type Triple,
} from '@/lib/income';
import { cn, formatRub } from '@/lib/utils';
import {
  addIncomeItem,
  removeIncomeItem,
  saveIncomeConfig,
  saveIncomeItems,
} from '@/server/actions/income';
import type { ActionResult } from '@/server/action-utils';
import { DealProposals } from './deal-proposals';
import { useForum } from './forum-context';

type ItemPatch = {
  key: string;
  label?: string;
  price?: number;
  priceMid?: number | null;
  priceFinal?: number | null;
  discount?: number;
  discountMid?: number | null;
  discountFinal?: number | null;
  planQty?: number;
  planMid?: number;
  planFinal?: number;
  planManual?: boolean;
  factQty?: number;
  factMid?: number;
  factFinal?: number;
  removed?: false;
};

/** Поля этапа: старт / середина / финал */
const PRICE_FIELD = ['price', 'priceMid', 'priceFinal'] as const;
const DISCOUNT_FIELD = ['discount', 'discountMid', 'discountFinal'] as const;
const PLAN_FIELD = ['planQty', 'planMid', 'planFinal'] as const;
const FACT_FIELD = ['factQty', 'factMid', 'factFinal'] as const;

const pctOf = (part: number, total: number) =>
  total ? `${Math.round((part / total) * 100).toLocaleString('ru-RU')}%` : '—';
const formatQty = (n: number) => `${n.toLocaleString('ru-RU').replace(/ | /g, ' ')} шт.`;
const formatPct = (n: number) => `${n.toLocaleString('ru-RU')}%`;
const sumOf = (t: Triple) => t[0] + t[1] + t[2];

/** Оптимистичное применение правки; незаданные цена и скидка этапа идут за предыдущим этапом */
function applyPatch(i: IncomeItemValue, p: ItemPatch): IncomeItemValue {
  const n: IncomeItemValue = {
    ...i,
    prices: [...i.prices],
    discounts: [...i.discounts],
    priceSet: [...i.priceSet],
    discountSet: [...i.discountSet],
    plan: [...i.plan],
    fact: [...i.fact],
  };
  if (p.label !== undefined) n.label = p.label;
  if (p.planManual !== undefined) n.planManual = p.planManual;
  for (let k = 0; k < 3; k++) {
    const price = p[PRICE_FIELD[k]];
    if (price !== undefined) {
      n.priceSet[k] = k === 0 || price !== null;
      if (price !== null) n.prices[k] = price;
    }
    const disc = p[DISCOUNT_FIELD[k]];
    if (disc !== undefined) {
      n.discountSet[k] = k === 0 || disc !== null;
      if (disc !== null) n.discounts[k] = disc;
    }
    if (k > 0 && !n.priceSet[k]) n.prices[k] = n.prices[k - 1];
    if (k > 0 && !n.discountSet[k]) n.discounts[k] = n.discounts[k - 1];
    const plan = p[PLAN_FIELD[k]];
    if (plan !== undefined) n.plan[k] = plan;
    const fact = p[FACT_FIELD[k]];
    if (fact !== undefined) n.fact[k] = fact;
  }
  return n;
}

export function IncomeView({
  initialItems,
  initialConfig,
  initialDeals,
}: {
  initialItems: IncomeItemValue[];
  initialConfig: IncomeConfig;
  /** Оплаченные сделки воронки — предложения в факт */
  initialDeals: DealValue[];
}) {
  const { forum, tasks, today } = useForum();
  const sp = useSearchParams();
  const view = sp.get('view') === 'fact' ? 'fact' : 'plan';
  const [items, setItems] = React.useState(initialItems);
  const [cfg, setCfg] = React.useState(initialConfig);
  const [deals, setDeals] = React.useState(initialDeals);
  const [saving, setSaving] = React.useState(false);
  const dates = stageDates(cfg, forum.salesStartDate, forum.startDate);
  const stageNow = currentStage(dates, today);
  /** Выбранный этап продаж билетов; null — все этапы вместе */
  const [stage, setStage] = React.useState<number | null>(stageNow);

  const expenses = tasks.reduce((s, t) => s + t.cost, 0);
  const target = incomeTarget(expenses);
  // План с автоподбором под цель: ручные позиции как есть, остальные добирают до цели
  const planned = React.useMemo(() => autoPlan(items, target, cfg), [items, target, cfg]);
  // В плане — только плановые статьи; в факте — ещё и статьи только для факта
  const shown = view === 'plan' ? planned.filter((i) => !i.factOnly) : planned;
  const partners = shown.filter((i) => !hasStages(i));
  const tickets = shown.filter(hasStages);
  const planSum = incomeSum(planned, 'plan');
  const factSum = incomeSum(planned, 'fact');
  const confirm = useConfirm();
  const removedDefaults = INCOME_ITEMS.filter((d) => !items.some((i) => i.key === d.key));
  const advice = planAdvice(planned, target);
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

  /** Ручной план этапа: остальные этапы фиксируются такими, как сейчас */
  const savePlan = (it: IncomeItemValue, k: number, v: number) => {
    const plan = [...it.plan] as Triple;
    plan[k] = v;
    void save([
      { key: it.key, planQty: plan[0], planMid: plan[1], planFinal: plan[2], planManual: true },
    ]);
  };
  const resetAuto = (it: IncomeItemValue) => save([{ key: it.key, planManual: false }]);

  const base = `/forums/${forum.id}/income`;
  const planGap = target - planSum;
  const partnersPlan = incomeSum(partners, 'plan');
  const ticketsPlan = incomeSum(tickets, 'plan');
  const ticketsFact = incomeSum(tickets, 'fact');
  const partnersFact = incomeSum(partners, 'fact');
  const addRow = (g: IncomeGroup, colSpan: number) =>
    view === 'plan' ? (
      <AddItemRow
        group={g}
        colSpan={colSpan}
        restore={removedDefaults.filter((x) => x.group === g.key)}
        onRestore={(key) => save([{ key, removed: false }])}
        onAdd={(label, price) =>
          apply(() => addIncomeItem(forum.id, { group: g.key, label, price }))
        }
      />
    ) : (
      <AddItemRow
        group={g}
        colSpan={colSpan}
        factOnly
        restore={[]}
        onRestore={() => undefined}
        onAdd={(label, price, discount) =>
          apply(() =>
            addIncomeItem(forum.id, { group: g.key, label, price, discount, factOnly: true }),
          )
        }
      />
    );
  const [gPartners, gTickets] = INCOME_GROUPS;

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
        <DealProposals
          forumId={forum.id}
          deals={deals}
          setDeals={setDeals}
          items={items}
          onItems={setItems}
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
          <ul className="mt-1.5 list-disc space-y-1 pl-6 text-ink/80">
            {todayAdvice.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Партнёрства: без этапов продаж */}
      <SectionTitle
        group={gPartners}
        note="Одна цена на весь период продаж; скидка — индивидуальная для позиции"
        sum={view === 'plan' ? partnersPlan : partnersFact}
        plan={view === 'fact' ? partnersPlan : undefined}
      />
      <div className="thin-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[900px] text-sm" data-testid="income-group-partners">
          {view === 'plan' ? <PlanHead /> : <FactHead />}
          <tbody>
            {partners.map((it) =>
              view === 'plan' ? (
                <PlanRow
                  key={it.key}
                  item={it}
                  stage={0}
                  total={planSum}
                  onSave={save}
                  onPlan={(v) => savePlan(it, 0, v)}
                  onAuto={() => resetAuto(it)}
                  onRemove={() => void remove(it)}
                />
              ) : (
                <FactRow
                  key={it.key}
                  item={it}
                  stage={0}
                  onSave={save}
                  onRemove={() => void remove(it)}
                />
              ),
            )}
            {addRow(gPartners, view === 'plan' ? 7 : 9)}
          </tbody>
        </table>
      </div>

      {/* Билеты: три этапа продаж */}
      <SectionTitle
        group={gTickets}
        note="Цена, скидка и план — свои на каждом этапе; итог складывается из всех этапов"
        sum={view === 'plan' ? ticketsPlan : ticketsFact}
        plan={view === 'fact' ? ticketsPlan : undefined}
      />
      <StageSwitch
        cfg={cfg}
        dates={dates}
        current={stageNow}
        selected={stage}
        onSelect={setStage}
        forumStart={forum.startDate}
        sums={[0, 1, 2].map((k) => ({
          plan: incomeSum(tickets, 'plan', k),
          fact: incomeSum(tickets, 'fact', k),
        }))}
        view={view}
        onSave={saveConfig}
      />
      <div className="thin-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[900px] text-sm" data-testid="income-group-tickets">
          {stage === null ? (
            <AllStagesHead view={view} />
          ) : view === 'plan' ? (
            <PlanHead stage={stage} />
          ) : (
            <FactHead stage={stage} />
          )}
          <tbody>
            {tickets.map((it) =>
              stage === null ? (
                <AllStagesRow
                  key={it.key}
                  item={it}
                  view={view}
                  onAuto={() => resetAuto(it)}
                  onRemove={() => void remove(it)}
                  onRename={(label) => save([{ key: it.key, label }])}
                />
              ) : view === 'plan' ? (
                <PlanRow
                  key={it.key}
                  item={it}
                  stage={stage}
                  total={planSum}
                  onSave={save}
                  onPlan={(v) => savePlan(it, stage, v)}
                  onAuto={() => resetAuto(it)}
                  onRemove={() => void remove(it)}
                />
              ) : (
                <FactRow
                  key={it.key}
                  item={it}
                  stage={stage}
                  onSave={save}
                  onRemove={() => void remove(it)}
                />
              ),
            )}
            {addRow(gTickets, view === 'plan' || stage === null ? 7 : 9)}
          </tbody>
        </table>
      </div>

      {/* Итог: партнёрства + билеты за все этапы */}
      <div className="mt-6 flex items-baseline gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="h-4 w-1.5 rounded-sm bg-ink/70" />
          Итого
        </h2>
        <span className="text-xs text-ink/50">Партнёрства и билеты за все этапы</span>
      </div>
      <div className="mt-2 overflow-hidden rounded-lg border border-line bg-white">
        <table className="w-full text-sm" data-testid="income-totals">
          <tbody>
            <TotalRow label="Партнёрства" value={view === 'plan' ? partnersPlan : partnersFact} />
            <TotalRow
              label="Билеты, все этапы"
              value={view === 'plan' ? ticketsPlan : ticketsFact}
            />
            <TotalRow
              label={
                view === 'plan' ? 'Итого план с учётом скидок' : 'Итого продано с учётом скидок'
              }
              value={view === 'plan' ? planSum : factSum}
              strong
              testId={view === 'plan' ? 'income-plan-net' : 'income-fact-net'}
              extra={view === 'fact' ? <Progress part={factSum} total={planSum} /> : null}
            />
            {view === 'fact' && <TotalRow label="План" value={planSum} muted />}
            <TotalRow
              label={`Цель: расходы ${formatRub(expenses)} + ${Math.round(INCOME_MARGIN * 100)}%`}
              value={target}
              muted
            />
            {view === 'plan' && target > 0 && (
              <tr className="border-t border-line">
                <td className="px-3 py-2">
                  {planGap > 0 ? 'До цели по плану не хватает' : 'План выше цели на'}
                </td>
                <td
                  className={cn(
                    'w-48 px-3 py-2 text-right font-medium tabular-nums',
                    planGap > 0 ? 'text-status-red' : 'text-status-green',
                  )}
                  data-testid="income-plan-gap"
                >
                  {formatRub(Math.abs(planGap))}
                </td>
                <td className="w-48" />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {view === 'plan' && advice.length > 0 && (
        <section
          className="mt-3 rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm"
          data-testid="income-advice"
        >
          <h3 className="flex items-center gap-2 font-semibold text-brand">
            <Lightbulb className="size-4" />
            Как устроен план продаж
          </h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-6 text-ink/80">
            {advice.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SectionTitle({
  group,
  note,
  sum,
  plan,
}: {
  group: IncomeGroup;
  note: string;
  sum: number;
  plan?: number;
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
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong,
  muted,
  testId,
  extra,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
  testId?: string;
  extra?: React.ReactNode;
}) {
  return (
    <tr
      className={cn(
        'border-t border-line first:border-t-0',
        strong && 'font-semibold',
        muted && 'text-ink/70',
      )}
    >
      <td className="px-3 py-2">{label}</td>
      <td className="w-48 px-3 py-2 text-right tabular-nums" data-testid={testId}>
        {formatRub(value)}
      </td>
      <td className="w-48 px-3 py-2">{extra}</td>
    </tr>
  );
}

const th = 'px-2 py-2 text-right font-medium';

function PlanHead({ stage }: { stage?: number }) {
  return (
    <thead className="bg-surface text-left text-xs text-ink/70">
      <tr>
        <th className="px-3 py-2 font-medium">
          Позиция
          {stage !== undefined && (
            <span className="ml-1 font-normal text-ink/50">· {PRICE_STAGES[stage].label}</span>
          )}
        </th>
        <th className={cn(th, 'w-36')}>Цена 1 ед.</th>
        <th className={cn(th, 'w-24')}>Скидка</th>
        <th className={cn(th, 'w-36')}>Цена со скидкой</th>
        <th className={cn(th, 'w-32')}>План, шт.</th>
        <th className={cn(th, 'w-40')}>Сумма по плану</th>
        <th className={cn(th, 'w-20 px-3')}>Доля</th>
      </tr>
    </thead>
  );
}

function FactHead({ stage }: { stage?: number }) {
  return (
    <thead className="bg-surface text-left text-xs text-ink/70">
      <tr>
        <th className="px-3 py-2 font-medium">
          Позиция
          {stage !== undefined && (
            <span className="ml-1 font-normal text-ink/50">· {PRICE_STAGES[stage].label}</span>
          )}
        </th>
        <th className={cn(th, 'w-32')}>Цена 1 ед.</th>
        <th className={cn(th, 'w-20')}>Скидка</th>
        <th className={cn(th, 'w-32')}>Цена со скидкой</th>
        <th className={cn(th, 'w-32')}>Продано, шт.</th>
        <th className={cn(th, 'w-40')}>Выручка</th>
        <th className={cn(th, 'w-32')}>План, шт.</th>
        <th className={cn(th, 'w-40')}>План, ₽</th>
        <th className={cn(th, 'w-44 px-3')}>Выполнение плана</th>
      </tr>
    </thead>
  );
}

function AllStagesHead({ view }: { view: 'plan' | 'fact' }) {
  return (
    <thead className="bg-surface text-left text-xs text-ink/70">
      <tr>
        <th className="px-3 py-2 font-medium">
          Позиция <span className="ml-1 font-normal text-ink/50">· все этапы</span>
        </th>
        {PRICE_STAGES.map((st) => (
          <th key={st.key} className={cn(th, 'w-32')}>
            {st.short}, шт.
          </th>
        ))}
        <th className={cn(th, 'w-32')}>{view === 'plan' ? 'План, шт.' : 'Продано, шт.'}</th>
        <th className={cn(th, 'w-40')}>{view === 'plan' ? 'Сумма по плану' : 'Выручка'}</th>
        <th className={cn(th, 'w-44 px-3')}>{view === 'plan' ? '' : 'Выполнение плана'}</th>
      </tr>
    </thead>
  );
}

/** Строка плана: условия этапа (цена, скидка), количество и сумма */
function PlanRow({
  item: it,
  stage: k,
  total,
  onSave,
  onPlan,
  onAuto,
  onRemove,
}: {
  item: IncomeItemValue;
  stage: number;
  total: number;
  onSave: (p: ItemPatch[]) => void;
  onPlan: (v: number) => void;
  onAuto: () => void;
  onRemove: () => void;
}) {
  const sum = itemSum(it, 'plan', k);
  const priceInherited = k > 0 && !it.priceSet[k];
  const discInherited = k > 0 && !it.discountSet[k];
  return (
    <tr className="border-t border-line/60" data-testid="income-row">
      <td className="py-1 pl-4 pr-3">
        <LabelCell
          item={it}
          onRename={(label) => onSave([{ key: it.key, label }])}
          onRemove={onRemove}
        />
      </td>
      <td className="px-1 py-1">
        <InheritCell
          value={it.prices[k]}
          inherited={priceInherited}
          canReset={k > 0 && it.priceSet[k]}
          format={formatRub}
          label={`Цена 1 ед.${k > 0 ? ` («${PRICE_STAGES[k].label}»)` : ''}: ${it.label}`}
          testId={`income-price-${k}-${it.key}`}
          onCommit={(v) => onSave([{ key: it.key, [PRICE_FIELD[k]]: v }])}
          onReset={() => onSave([{ key: it.key, [PRICE_FIELD[k]]: null }])}
        />
      </td>
      <td className="px-1 py-1">
        <InheritCell
          value={it.discounts[k]}
          inherited={discInherited}
          canReset={k > 0 && it.discountSet[k]}
          format={(v) => (v ? formatPct(v) : '—')}
          label={`Скидка, %: ${it.label}`}
          testId={`income-discount-${k}-${it.key}`}
          onCommit={(v) => onSave([{ key: it.key, [DISCOUNT_FIELD[k]]: Math.min(100, v) }])}
          onReset={() => onSave([{ key: it.key, [DISCOUNT_FIELD[k]]: null }])}
        />
      </td>
      <td
        className={cn(
          'px-2 py-1.5 text-right tabular-nums',
          it.discounts[k] ? 'text-ink' : 'text-ink/50',
        )}
      >
        {formatRub(Math.round(netPrice(it, k)))}
      </td>
      <td className="px-1 py-1">
        <div className="flex items-center justify-end gap-1">
          <AutoBadge item={it} onAuto={onAuto} />
          <NumberCell
            value={it.plan[k]}
            format={formatQty}
            label={`План, шт.: ${it.label}`}
            onCommit={onPlan}
            testId={`income-plan-${k}-${it.key}`}
            className={cn('min-w-0 flex-1', !it.planManual && 'text-ink/60')}
          />
        </div>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{formatRub(sum)}</td>
      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-ink/60">
        {sum ? pctOf(sum, total) : ''}
      </td>
    </tr>
  );
}

/**
 * Строка факта на этапе: продано, выручка со скидкой и выполнение плана этапа. Название можно
 * поменять; у статьи только для факта правятся цена и скидка, её можно убрать.
 */
function FactRow({
  item: it,
  stage: k,
  onSave,
  onRemove,
}: {
  item: IncomeItemValue;
  stage: number;
  onSave: (p: ItemPatch[]) => void;
  onRemove: () => void;
}) {
  const fact = itemSum(it, 'fact', k);
  const plan = itemSum(it, 'plan', k);
  return (
    <tr className="border-t border-line/60" data-testid="income-row">
      <td className="py-1 pl-4 pr-3">
        <LabelCell
          item={it}
          onRename={(label) => onSave([{ key: it.key, label }])}
          onRemove={it.factOnly ? onRemove : undefined}
        />
      </td>
      {it.factOnly ? (
        <>
          <td className="px-1 py-1">
            <InheritCell
              value={it.prices[k]}
              inherited={k > 0 && !it.priceSet[k]}
              canReset={k > 0 && it.priceSet[k]}
              format={formatRub}
              label={`Цена 1 ед.: ${it.label}`}
              testId={`income-price-${k}-${it.key}`}
              onCommit={(v) => onSave([{ key: it.key, [PRICE_FIELD[k]]: v }])}
              onReset={() => onSave([{ key: it.key, [PRICE_FIELD[k]]: null }])}
            />
          </td>
          <td className="px-1 py-1">
            <InheritCell
              value={it.discounts[k]}
              inherited={k > 0 && !it.discountSet[k]}
              canReset={k > 0 && it.discountSet[k]}
              format={(v) => (v ? formatPct(v) : '—')}
              label={`Скидка, %: ${it.label}`}
              testId={`income-discount-${k}-${it.key}`}
              onCommit={(v) => onSave([{ key: it.key, [DISCOUNT_FIELD[k]]: Math.min(100, v) }])}
              onReset={() => onSave([{ key: it.key, [DISCOUNT_FIELD[k]]: null }])}
            />
          </td>
        </>
      ) : (
        <>
          <td className="px-2 py-1.5 text-right tabular-nums text-ink/70">
            {formatRub(it.prices[k])}
          </td>
          <td className="px-2 py-1.5 text-right tabular-nums text-ink/70">
            {it.discounts[k] ? formatPct(it.discounts[k]) : '—'}
          </td>
        </>
      )}
      <td className="px-2 py-1.5 text-right tabular-nums text-ink/70">
        {formatRub(Math.round(netPrice(it, k)))}
      </td>
      <td className="px-1 py-1">
        <NumberCell
          value={it.fact[k]}
          format={formatQty}
          label={`Продано, шт.: ${it.label}`}
          onCommit={(v) => onSave([{ key: it.key, [FACT_FIELD[k]]: v }])}
          testId={`income-fact-${k}-${it.key}`}
        />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{formatRub(fact)}</td>
      {it.factOnly ? (
        <td colSpan={3} className="px-3 py-1.5 text-right text-xs text-ink/50">
          нет в плане
        </td>
      ) : (
        <>
          <td className="px-2 py-1.5 text-right tabular-nums text-ink/70">
            {formatQty(it.plan[k])}
          </td>
          <td className="px-2 py-1.5 text-right tabular-nums text-ink/70">{formatRub(plan)}</td>
          <td className="px-3 py-1.5">
            <Progress part={fact} total={plan} />
          </td>
        </>
      )}
    </tr>
  );
}

/** Билет за все этапы: количество по этапам и накопленный итог */
function AllStagesRow({
  item: it,
  view,
  onAuto,
  onRemove,
  onRename,
}: {
  item: IncomeItemValue;
  view: 'plan' | 'fact';
  onAuto: () => void;
  onRemove: () => void;
  onRename: (label: string) => void;
}) {
  const q = view === 'plan' ? it.plan : it.fact;
  const sum = itemSum(it, view, null);
  const plan = itemSum(it, 'plan', null);
  return (
    <tr className="border-t border-line/60" data-testid="income-row">
      <td className="py-1 pl-4 pr-3">
        <LabelCell
          item={it}
          onRename={onRename}
          onRemove={view === 'plan' || it.factOnly ? onRemove : undefined}
        />
      </td>
      {q.map((n, k) => (
        <td key={k} className="px-2 py-1.5 text-right tabular-nums text-ink/70">
          {formatQty(n)}
        </td>
      ))}
      <td className="px-2 py-1.5 text-right tabular-nums">
        <div className="flex items-center justify-end gap-1">
          {view === 'plan' && <AutoBadge item={it} onAuto={onAuto} />}
          {formatQty(sumOf(q))}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{formatRub(sum)}</td>
      <td className="px-3 py-1.5">
        {view === 'fact' &&
          (it.factOnly ? (
            <span className="block text-right text-xs text-ink/50">нет в плане</span>
          ) : (
            <Progress part={sum} total={plan} />
          ))}
      </td>
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

/** Значение этапа: своё или (серым) как на предыдущем этапе; ↺ возвращает к предыдущему */
function InheritCell({
  value,
  inherited,
  canReset,
  format,
  label,
  testId,
  onCommit,
  onReset,
}: {
  value: number;
  inherited: boolean;
  canReset: boolean;
  format: (n: number) => string;
  label: string;
  testId: string;
  onCommit: (v: number) => void;
  onReset: () => void;
}) {
  return (
    <div
      className="group flex items-center justify-end gap-0.5"
      title={inherited ? 'Как на предыдущем этапе — нажмите, чтобы задать своё' : undefined}
    >
      <NumberCell
        value={value}
        format={format}
        label={label}
        onCommit={onCommit}
        testId={testId}
        className={cn('min-w-0 flex-1', inherited && 'text-ink/40')}
      />
      {canReset && (
        <button
          type="button"
          className="rounded p-1 text-ink/40 opacity-0 hover:bg-surface hover:text-brand focus-visible:opacity-100 group-hover:opacity-100"
          title="Как на предыдущем этапе"
          aria-label={`${label}: как на предыдущем этапе`}
          onClick={onReset}
        >
          <RotateCcw className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Переключатель этапов продаж билетов: карточки «Старт продаж», «Середина», «Финальная
 * стадия» с датами, долей автоподбора и суммой этапа, плюс «Все этапы» — накопленный итог.
 */
function StageSwitch({
  cfg,
  dates,
  current,
  selected,
  onSelect,
  forumStart,
  sums,
  view,
  onSave,
}: {
  cfg: IncomeConfig;
  dates: [string, string, string];
  current: number;
  selected: number | null;
  onSelect: (k: number | null) => void;
  forumStart: string;
  sums: { plan: number; fact: number }[];
  view: 'plan' | 'fact';
  onSave: (patch: Partial<IncomeConfig>) => void;
}) {
  const setShare = (k: number, v: number) => {
    const shares = [...cfg.shares] as Triple;
    shares[k] = Math.min(100, v);
    onSave({ shares });
  };
  const total = sums.reduce((a, s) => ({ plan: a.plan + s.plan, fact: a.fact + s.fact }), {
    plan: 0,
    fact: 0,
  });
  const amount = (s: { plan: number; fact: number }) =>
    view === 'plan' ? formatRub(s.plan) : `${formatRub(s.fact)} из ${formatRub(s.plan)}`;
  const card = (active: boolean) =>
    cn(
      'cursor-pointer rounded-md border px-3 py-2 text-left transition-colors',
      active
        ? 'border-brand bg-brand/5 ring-1 ring-brand'
        : 'border-line bg-white hover:border-brand/50',
    );
  return (
    <div
      className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
      role="tablist"
      data-testid="income-stages"
    >
      {PRICE_STAGES.map((st, k) => {
        const to = k < 2 ? dates[k + 1] : forumStart;
        return (
          <div
            key={st.key}
            role="tab"
            tabIndex={0}
            aria-selected={selected === k}
            onClick={() => onSelect(k)}
            onKeyDown={(e) =>
              (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && onSelect(k)
            }
            className={card(selected === k)}
            data-testid={`income-stage-${st.key}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={cn('text-sm font-medium', selected === k && 'text-brand')}>
                {k + 1}. {st.label}
              </span>
              {k === current && (
                <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-medium text-white">
                  сейчас
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink/70">
              {k === 0 ? (
                <span title="Дата старта продаж задаётся в карточке форума">
                  с {formatDate(dates[0])}
                </span>
              ) : (
                <label
                  className="inline-flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  с
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
                    aria-label={`Дата начала этапа «${st.label}»`}
                    data-testid={`income-stage-date-${st.key}`}
                  />
                </label>
              )}
              <span>по {formatDate(to)}</span>
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums">{amount(sums[k])}</div>
            <div
              className="flex items-center gap-1 text-xs text-ink/60"
              onClick={(e) => e.stopPropagation()}
              title="Как автоподбор раскладывает план билетов по этапам"
            >
              Доля автоподбора
              <NumberCell
                value={cfg.shares[k]}
                format={formatPct}
                label={`Доля автоподбора на этапе «${st.label}», %`}
                onCommit={(v) => setShare(k, v)}
                testId={`income-share-${st.key}`}
                className="w-auto py-0 text-left text-xs font-medium text-ink"
                inputClassName="h-6 w-16 text-left"
              />
            </div>
          </div>
        );
      })}
      <div
        role="tab"
        tabIndex={0}
        aria-selected={selected === null}
        onClick={() => onSelect(null)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(null)}
        className={card(selected === null)}
        data-testid="income-stage-all"
      >
        <span className={cn('text-sm font-medium', selected === null && 'text-brand')}>
          Все этапы
        </span>
        <div className="mt-1 text-xs text-ink/70">Накопленный итог по билетам</div>
        <div className="mt-1 text-sm font-semibold tabular-nums">{amount(total)}</div>
      </div>
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

/** Строка «+ Добавить позицию» в конце группы; там же — возврат убранных позиций по умолчанию. */
function AddItemRow({
  group,
  colSpan,
  restore,
  onRestore,
  onAdd,
  factOnly,
}: {
  group: IncomeGroup;
  colSpan: number;
  restore: { key: string; label: string }[];
  onRestore: (key: string) => void;
  onAdd: (label: string, price: number, discount: number) => Promise<boolean>;
  /** Статья только для факта: со скидкой, без плана */
  factOnly?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [discount, setDiscount] = React.useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = label.trim();
    const n = Math.round(Number(price.replace(/[\s  ₽]/g, '').replace(',', '.')) || 0);
    if (!name) return;
    const d = Number(discount.replace(/[\s%]/g, '').replace(',', '.')) || 0;
    if (await onAdd(name, Math.max(0, n), Math.min(100, Math.max(0, d)))) {
      setLabel('');
      setPrice('');
      setDiscount('');
      setOpen(false);
    }
  };
  return (
    <tr className="border-t border-line/60">
      <td colSpan={colSpan} className="py-1.5 pl-12 pr-3">
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
            {factOnly && (
              <input
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                inputMode="decimal"
                placeholder="Скидка, %"
                className="h-8 w-28 rounded border border-line px-2 text-right text-sm tabular-nums focus:border-brand focus:outline-none"
                aria-label="Скидка, %"
                data-testid={`income-add-discount-${group.key}`}
              />
            )}
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
              {factOnly ? 'Добавить статью факта' : 'Добавить позицию'}
            </button>
            {factOnly && (
              <span className="text-xs text-ink/50">
                например, продажа с индивидуальной скидкой — в плане её не будет
              </span>
            )}
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
