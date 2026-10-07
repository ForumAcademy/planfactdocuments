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
import { formatDate } from '@/lib/dates';
import {
  DISCOUNTS,
  INCOME_GROUPS,
  INCOME_ITEMS,
  INCOME_MARGIN,
  PRICE_STAGES,
  autoPlan,
  currentStage,
  factTotals,
  incomeTarget,
  planAdvice,
  planTotals,
  planUnitGross,
  planUnitNet,
  soldQty,
  stageDates,
  stagePrices,
  type IncomeConfig,
  type IncomeGroup,
  type IncomeItemValue,
} from '@/lib/income';
import { cn, formatRub } from '@/lib/utils';
import {
  addIncomeItem,
  removeIncomeItem,
  saveIncomeConfig,
  saveIncomeItems,
} from '@/server/actions/income';
import type { ActionResult } from '@/server/action-utils';
import { useForum } from './forum-context';

type ItemPatch = {
  key: string;
  label?: string;
  price?: number;
  priceMid?: number | null;
  priceFinal?: number | null;
  planQty?: number;
  planManual?: boolean;
  factQty?: number;
  factMid?: number;
  factFinal?: number;
  discountPersonal?: number;
  discountPartner?: number;
  removed?: false;
};

const pctOf = (part: number, total: number) =>
  total ? `${Math.round((part / total) * 100).toLocaleString('ru-RU')}%` : '—';
const formatQty = (n: number) => `${n.toLocaleString('ru-RU').replace(/ | /g, ' ')} шт.`;
const formatPct = (n: number) => `${n.toLocaleString('ru-RU')}%`;

/** Оптимистичное применение правки: цены этапов без своего значения идут за предыдущим этапом */
function applyPatch(i: IncomeItemValue, p: ItemPatch): IncomeItemValue {
  const n: IncomeItemValue = { ...i };
  if (p.label !== undefined) n.label = p.label;
  if (p.planQty !== undefined) n.planQty = p.planQty;
  if (p.planManual !== undefined) n.planManual = p.planManual;
  if (p.factQty !== undefined) n.factQty = p.factQty;
  if (p.factMid !== undefined) n.factMid = p.factMid;
  if (p.factFinal !== undefined) n.factFinal = p.factFinal;
  if (p.discountPersonal !== undefined) n.discountPersonal = p.discountPersonal;
  if (p.discountPartner !== undefined) n.discountPartner = p.discountPartner;
  if (p.price !== undefined) n.price = p.price;
  if (p.priceMid !== undefined) n.priceMidSet = p.priceMid !== null;
  if (p.priceFinal !== undefined) n.priceFinalSet = p.priceFinal !== null;
  n.priceMid = n.priceMidSet ? (p.priceMid ?? i.priceMid) : n.price;
  n.priceFinal = n.priceFinalSet ? (p.priceFinal ?? i.priceFinal) : n.priceMid;
  return n;
}

export function IncomeView({
  initialItems,
  initialConfig,
}: {
  initialItems: IncomeItemValue[];
  initialConfig: IncomeConfig;
}) {
  const { forum, tasks, today } = useForum();
  const sp = useSearchParams();
  const view = sp.get('view') === 'fact' ? 'fact' : 'plan';
  const [items, setItems] = React.useState(initialItems);
  const [cfg, setCfg] = React.useState(initialConfig);
  const [saving, setSaving] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  const expenses = tasks.reduce((s, t) => s + t.cost, 0);
  const target = incomeTarget(expenses);
  // План с автоподбором под цель: ручные позиции как есть, остальные добирают до цели
  const planned = React.useMemo(() => autoPlan(items, target, cfg), [items, target, cfg]);
  const plan = planTotals(planned, cfg);
  const fact = factTotals(planned);
  const planSum = plan.net;
  const factSum = fact.net;
  const confirm = useConfirm();
  const removedDefaults = INCOME_ITEMS.filter((d) => !items.some((i) => i.key === d.key));
  const advice = planAdvice(planned, target, cfg);
  const dates = stageDates(cfg, forum.salesStartDate, forum.startDate);
  const stageNow = currentStage(dates, today);

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
  const unitGross = (i: IncomeItemValue) => planUnitGross(i, cfg);
  const groupGross = (list: IncomeItemValue[]) =>
    Math.round(list.reduce((s, i) => s + unitGross(i) * i.planQty, 0));
  const itemPlanNet = (i: IncomeItemValue) => Math.round(planUnitNet(i, cfg) * i.planQty);
  const itemFactNet = (i: IncomeItemValue) => factTotals([i]).net;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4" data-testid="income-view">
      <IncomeSummary
        forumId={forum.id}
        expenses={expenses}
        target={target}
        plan={planSum}
        fact={factSum}
      />

      <PriceStages
        cfg={cfg}
        dates={dates}
        current={stageNow}
        forumStart={forum.startDate}
        onSave={saveConfig}
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
            <p className="max-w-4xl text-xs text-ink/60">
              Цена задаётся на каждом этапе; пустая цена этапа (серым) равна цене предыдущего. Сумма
              считается по долям продаж на этапах, скидки вычитаются в итоге. Количество подбирается
              автоматически под цель (расходы + {Math.round(INCOME_MARGIN * 100)}%); любое
              количество можно изменить вручную — остальные позиции пересчитаются.
            </p>
          </div>
          <div className="thin-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-surface text-left text-xs text-ink/70">
                <tr>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>
                    Позиция
                  </th>
                  <th className="px-2 pt-2 text-center font-medium" colSpan={3}>
                    Цена 1 ед. по этапам
                  </th>
                  <th className="w-28 px-2 py-2 text-right font-medium" rowSpan={2}>
                    План, шт.
                  </th>
                  <th
                    className="w-40 px-2 py-2 text-right font-medium"
                    rowSpan={2}
                    title="Количество × средняя цена по долям этапов, до скидок"
                  >
                    Сумма по плану
                  </th>
                  <th className="w-20 px-3 py-2 text-right font-medium" rowSpan={2}>
                    Доля
                  </th>
                </tr>
                <tr>
                  {PRICE_STAGES.map((st, k) => (
                    <StageTh
                      key={st.key}
                      label={st.short}
                      share={cfg.shares[k]}
                      now={k === stageNow}
                    />
                  ))}
                </tr>
              </thead>
              {INCOME_GROUPS.map((g) => {
                const list = planned.filter((i) => i.group === g.key);
                const open = !collapsed.has(g.key);
                const sum = groupGross(list);
                return (
                  <tbody key={g.key} data-testid={`income-group-${g.key}`}>
                    <GroupRow
                      group={g}
                      open={open}
                      onToggle={() => toggle(g.key)}
                      cells={[
                        null,
                        null,
                        null,
                        formatQty(list.reduce((s, i) => s + i.planQty, 0)),
                        formatRub(sum),
                        <span key="share" className="font-normal text-ink/70">
                          {pctOf(sum, plan.gross)}
                        </span>,
                      ]}
                    />
                    {open &&
                      list.map((it) => (
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
                              label={`Цена «Старт продаж»: ${it.label}`}
                              onCommit={(price) => save([{ key: it.key, price }])}
                              testId={`income-price-${it.key}`}
                            />
                          </td>
                          <StagePriceCell
                            item={it}
                            field="priceMid"
                            stage="Середина"
                            onSave={(v) => save([{ key: it.key, priceMid: v }])}
                          />
                          <StagePriceCell
                            item={it}
                            field="priceFinal"
                            stage="Финальная стадия"
                            onSave={(v) => save([{ key: it.key, priceFinal: v }])}
                          />
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
                            {formatRub(Math.round(unitGross(it) * it.planQty))}
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-ink/60">
                            {it.planQty ? pctOf(unitGross(it) * it.planQty, plan.gross) : ''}
                          </td>
                        </tr>
                      ))}
                    {open && (
                      <AddItemRow
                        group={g}
                        colSpan={7}
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
                  <td className="px-3 py-2.5" colSpan={5}>
                    Сумма по ценам этапов
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatRub(plan.gross)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {plan.gross ? '100%' : '—'}
                  </td>
                </tr>
                {DISCOUNTS.map((d) => {
                  const rate = d.key === 'personal' ? cfg.discountPersonal : cfg.discountPartner;
                  const value = d.key === 'personal' ? plan.personal : plan.partner;
                  return (
                    <tr key={d.key} className="border-t border-line text-ink/70">
                      <td className="px-3 py-2" colSpan={5}>
                        {d.label}, {formatPct(rate)} выручки
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {value ? `−${formatRub(value)}` : formatRub(0)}
                      </td>
                      <td />
                    </tr>
                  );
                })}
                <tr className="border-t border-line font-semibold">
                  <td className="px-3 py-2.5" colSpan={5}>
                    Итого план с учётом скидок
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums" data-testid="income-plan-net">
                    {formatRub(planSum)}
                  </td>
                  <td />
                </tr>
                <tr className="border-t border-line text-ink/70">
                  <td className="px-3 py-2" colSpan={5}>
                    Цель: расходы {formatRub(expenses)} + {Math.round(INCOME_MARGIN * 100)}%
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatRub(target)}</td>
                  <td />
                </tr>
                {target > 0 && (
                  <tr className="border-t border-line">
                    <td className="px-3 py-2" colSpan={5}>
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
            <p className="max-w-4xl text-xs text-ink/60">
              Укажите, сколько продано по ценам каждого этапа, и суммы скидок, которые дали
              покупателям. Выручка = продажи по ценам этапов − скидки. Цены задаются во вкладке
              «План».
            </p>
          </div>
          <div className="thin-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[1240px] text-sm">
              <thead className="bg-surface text-left text-xs text-ink/70">
                <tr>
                  <th className="px-3 py-2 font-medium" rowSpan={2}>
                    Позиция
                  </th>
                  <th className="px-2 pt-2 text-center font-medium" colSpan={3}>
                    Продано по этапам, шт.
                  </th>
                  <th className="px-2 pt-2 text-center font-medium" colSpan={2}>
                    Скидки, ₽
                  </th>
                  <th className="w-36 px-2 py-2 text-right font-medium" rowSpan={2}>
                    Выручка
                  </th>
                  <th className="w-36 px-2 py-2 text-right font-medium" rowSpan={2}>
                    План
                  </th>
                  <th
                    className="w-40 px-3 py-2 text-right font-medium"
                    rowSpan={2}
                    title="Доля выручки от плана"
                  >
                    Выполнение плана
                  </th>
                </tr>
                <tr>
                  {PRICE_STAGES.map((st, k) => (
                    <StageTh key={st.key} label={st.short} now={k === stageNow} />
                  ))}
                  <th className="w-32 px-2 pb-2 text-right font-normal">Индивидуальные</th>
                  <th className="w-32 px-2 pb-2 text-right font-normal">Партнёрские</th>
                </tr>
              </thead>
              {INCOME_GROUPS.map((g) => {
                const list = planned.filter((i) => i.group === g.key);
                const open = !collapsed.has(g.key);
                const gf = factTotals(list);
                const gp = list.reduce((s, i) => s + itemPlanNet(i), 0);
                return (
                  <tbody key={g.key} data-testid={`income-group-${g.key}`}>
                    <GroupRow
                      group={g}
                      open={open}
                      onToggle={() => toggle(g.key)}
                      cells={[
                        formatQty(list.reduce((s, i) => s + i.factQty, 0)),
                        formatQty(list.reduce((s, i) => s + i.factMid, 0)),
                        formatQty(list.reduce((s, i) => s + i.factFinal, 0)),
                        gf.personal ? `−${formatRub(gf.personal)}` : formatRub(0),
                        gf.partner ? `−${formatRub(gf.partner)}` : formatRub(0),
                        formatRub(gf.net),
                        formatRub(gp),
                        <Progress key="p" part={gf.net} total={gp} />,
                      ]}
                    />
                    {open &&
                      list.map((it) => (
                        <tr
                          key={it.key}
                          className="border-t border-line/60"
                          data-testid="income-row"
                        >
                          <td className="py-1.5 pl-12 pr-3">
                            {it.label}
                            <div className="text-xs text-ink/50">
                              {soldQty(it) ? `всего ${formatQty(soldQty(it))}` : ''}
                            </div>
                          </td>
                          {(['factQty', 'factMid', 'factFinal'] as const).map((f, k) => (
                            <td key={f} className={cn('px-1 py-1', k === stageNow && 'bg-brand/5')}>
                              <NumberCell
                                value={it[f]}
                                format={formatQty}
                                label={`Продано по цене «${PRICE_STAGES[k].label}»: ${it.label}`}
                                onCommit={(v) => save([{ key: it.key, [f]: v }])}
                                testId={`income-fact-${PRICE_STAGES[k].key}-${it.key}`}
                              />
                              <div className="pr-1.5 text-right text-[11px] text-ink/40">
                                по {formatRub(stagePrices(it)[k])}
                              </div>
                            </td>
                          ))}
                          {(['discountPersonal', 'discountPartner'] as const).map((f) => (
                            <td key={f} className="px-1 py-1 align-top">
                              <NumberCell
                                value={it[f]}
                                format={(v) => (v ? `−${formatRub(v)}` : formatRub(0))}
                                label={`${f === 'discountPersonal' ? 'Индивидуальные' : 'Партнёрские'} скидки, ₽: ${it.label}`}
                                onCommit={(v) => save([{ key: it.key, [f]: v }])}
                                testId={`income-${f}-${it.key}`}
                                className={cn(!it[f] && 'text-ink/40')}
                              />
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-right align-top tabular-nums">
                            {formatRub(itemFactNet(it))}
                          </td>
                          <td className="px-2 py-1.5 text-right align-top tabular-nums text-ink/70">
                            {formatRub(itemPlanNet(it))}
                          </td>
                          <td className="px-3 py-1.5 align-top">
                            <Progress part={itemFactNet(it)} total={itemPlanNet(it)} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                );
              })}
              <tfoot>
                <tr className="border-t-2 border-brand/40 font-semibold">
                  <td className="px-3 py-2.5">Итого</td>
                  {(['factQty', 'factMid', 'factFinal'] as const).map((f) => (
                    <td key={f} className="px-2 py-2.5 text-right tabular-nums">
                      {formatQty(planned.reduce((s, i) => s + i[f], 0))}
                    </td>
                  ))}
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {fact.personal ? `−${formatRub(fact.personal)}` : formatRub(0)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {fact.partner ? `−${formatRub(fact.partner)}` : formatRub(0)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums" data-testid="income-fact-net">
                    {formatRub(factSum)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-ink/70">
                    {formatRub(planSum)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Progress part={factSum} total={planSum} />
                  </td>
                </tr>
                <tr className="border-t border-line text-ink/70">
                  <td className="px-3 py-2" colSpan={6}>
                    Продажи по ценам этапов {formatRub(fact.gross)} − скидки{' '}
                    {formatRub(fact.personal + fact.partner)}. Цель: расходы {formatRub(expenses)} +{' '}
                    {Math.round(INCOME_MARGIN * 100)}%
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

/** Заголовок столбца этапа: название, доля в плане и отметка текущего этапа */
function StageTh({ label, share, now }: { label: string; share?: number; now: boolean }) {
  return (
    <th
      className={cn('w-36 px-2 pb-2 text-right font-normal', now && 'bg-brand/5 text-brand')}
      title={now ? 'Текущий этап цен' : undefined}
    >
      {now && <span className="mr-1 inline-block size-1.5 rounded-full bg-brand align-middle" />}
      {label}
      {share !== undefined && <span className="ml-1 text-ink/40">{share}%</span>}
    </th>
  );
}

/** Цена «Середины» / «Финала»: своя или (серым) как на предыдущем этапе */
function StagePriceCell({
  item,
  field,
  stage,
  onSave,
}: {
  item: IncomeItemValue;
  field: 'priceMid' | 'priceFinal';
  stage: string;
  onSave: (v: number | null) => void;
}) {
  const set = field === 'priceMid' ? item.priceMidSet : item.priceFinalSet;
  return (
    <td className="px-1 py-1">
      <div className="group flex items-center justify-end gap-0.5">
        <NumberCell
          value={item[field]}
          format={formatRub}
          label={`Цена «${stage}»: ${item.label}`}
          onCommit={(v) => onSave(v)}
          testId={`income-${field}-${item.key}`}
          className={cn('min-w-0 flex-1', !set && 'text-ink/40')}
        />
        {set && (
          <button
            type="button"
            className="rounded p-1 text-ink/40 opacity-0 hover:bg-surface hover:text-brand focus-visible:opacity-100 group-hover:opacity-100"
            title="Как на предыдущем этапе"
            aria-label={`Цена «${stage}» как на предыдущем этапе: ${item.label}`}
            onClick={() => onSave(null)}
          >
            <RotateCcw className="size-3" />
          </button>
        )}
      </div>
    </td>
  );
}

/**
 * Этапы цен на одной линии от старта продаж до форума: даты смены цен, доля плана на каждом
 * этапе, текущий этап; рядом — плановые скидки.
 */
function PriceStages({
  cfg,
  dates,
  current,
  forumStart,
  onSave,
}: {
  cfg: IncomeConfig;
  dates: [string, string, string];
  current: number;
  forumStart: string;
  onSave: (patch: Partial<IncomeConfig>) => void;
}) {
  const sharesSum = cfg.shares.reduce((a, b) => a + b, 0);
  const setShare = (k: number, v: number) => {
    const shares = [...cfg.shares] as [number, number, number];
    shares[k] = Math.min(100, v);
    onSave({ shares });
  };
  return (
    <section className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]" data-testid="income-stages">
      <div className="rounded-lg border border-line bg-white px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Этапы цен</h2>
          <span className={cn('text-xs', sharesSum === 100 ? 'text-ink/50' : 'text-yellow-700')}>
            {sharesSum === 100
              ? 'Доля — какая часть плана продаётся по ценам этапа'
              : `Сумма долей ${sharesSum}% — в расчёте доли приводятся к 100%`}
          </span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {PRICE_STAGES.map((st, k) => {
            const now = k === current;
            const to = k < 2 ? dates[k + 1] : forumStart;
            return (
              <div
                key={st.key}
                className={cn(
                  'rounded-md border px-3 py-2',
                  now ? 'border-brand bg-brand/5' : 'border-line',
                )}
                data-testid={`income-stage-${st.key}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('text-sm font-medium', now && 'text-brand')}>
                    {k + 1}. {st.label}
                  </span>
                  {now && (
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
                    <label className="inline-flex items-center gap-1">
                      с
                      <input
                        type="date"
                        value={dates[k]}
                        min={dates[k - 1]}
                        max={forumStart}
                        onChange={(e) =>
                          e.target.value &&
                          onSave(
                            k === 1 ? { midDate: e.target.value } : { finalDate: e.target.value },
                          )
                        }
                        className="h-6 rounded border border-line px-1 text-xs tabular-nums focus:border-brand focus:outline-none"
                        aria-label={`Дата начала этапа «${st.label}»`}
                        data-testid={`income-stage-date-${st.key}`}
                      />
                    </label>
                  )}
                  <span>по {formatDate(to)}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-ink/70">
                  Доля плана
                  <NumberCell
                    value={cfg.shares[k]}
                    format={formatPct}
                    label={`Доля плана продаж на этапе «${st.label}», %`}
                    onCommit={(v) => setShare(k, v)}
                    testId={`income-share-${st.key}`}
                    className="w-auto py-0 text-left text-sm font-semibold text-ink"
                    inputClassName="h-6 w-16 text-left"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div
        className="rounded-lg border border-line bg-white px-4 py-3 lg:w-72"
        data-testid="income-discounts"
      >
        <h2 className="text-sm font-semibold">Скидки в плане</h2>
        <p className="text-xs text-ink/50">% от выручки; в факте — суммы по позициям</p>
        {DISCOUNTS.map((d) => (
          <div key={d.key} className="mt-1.5 flex items-center justify-between gap-2 text-sm">
            <span className="text-ink/80">{d.label}</span>
            <NumberCell
              value={d.key === 'personal' ? cfg.discountPersonal : cfg.discountPartner}
              format={formatPct}
              label={`${d.label}, % от выручки`}
              onCommit={(v) =>
                onSave(
                  d.key === 'personal'
                    ? { discountPersonal: Math.min(100, v) }
                    : { discountPartner: Math.min(100, v) },
                )
              }
              testId={`income-discount-${d.key}`}
              className="w-20 font-semibold"
              inputClassName="w-20"
            />
          </div>
        ))}
      </div>
    </section>
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
  colSpan,
  restore,
  onRestore,
  onAdd,
}: {
  group: IncomeGroup;
  colSpan: number;
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
