'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Lightbulb,
  TrendingDown,
  XCircle,
} from 'lucide-react';
import { TabGroup, TabLink } from '@/components/ui/tab-links';
import { Select } from '@/components/ui/input';
import { formatDate } from '@/lib/dates';
import {
  DEAL_STAGES,
  REFUSED,
  breakdown,
  daysInStage,
  funnelAdvice,
  funnelStats,
  isStale,
  reachedIndex,
  stageIndex,
  statusLabel,
  sumAmount,
  sumQty,
  type Breakdown,
  type DealStageKey,
  type DealValue,
  type FunnelAdvice,
  type StageStat,
} from '@/lib/funnel';
import {
  autoPlan,
  incomeSum,
  incomeTarget,
  type IncomeConfig,
  type IncomeItemValue,
} from '@/lib/income';
import { cn, formatRub, formatRubShort, pluralRu } from '@/lib/utils';
import { DealsTable } from './deals-table';
import { useForum } from './forum-context';

type Selected = DealStageKey | 'refused';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const dealsWord = (n: number) => pluralRu(n, 'сделка', 'сделки', 'сделок');

export function FunnelView({
  initialDeals,
  items,
  config,
}: {
  initialDeals: DealValue[];
  items: IncomeItemValue[];
  config: IncomeConfig;
}) {
  const { forum, tasks, today } = useForum();
  const sp = useSearchParams();
  const view = sp.get('view') === 'table' ? 'table' : 'funnel';
  const [deals, setDeals] = React.useState(initialDeals);
  const [source, setSource] = React.useState('');
  const [manager, setManager] = React.useState('');

  const sources = React.useMemo(
    () => breakdown(deals, (d) => d.source).map((b) => b.name),
    [deals],
  );
  const managers = React.useMemo(
    () => breakdown(deals, (d) => d.manager).map((b) => b.name),
    [deals],
  );
  const filtered = React.useMemo(
    () =>
      deals.filter(
        (d) =>
          (!source || (d.source || 'Не указано') === source) &&
          (!manager || (d.manager || 'Не указано') === manager),
      ),
    [deals, source, manager],
  );

  const directionLabel = React.useCallback(
    (key: string | null) => items.find((i) => i.key === key)?.label ?? '',
    [items],
  );
  const expenses = tasks.reduce((s, t) => s + t.cost, 0);
  const planSum = React.useMemo(
    () => incomeSum(autoPlan(items, incomeTarget(expenses), config), 'plan'),
    [items, expenses, config],
  );

  const base = `/forums/${forum.id}/funnel`;
  const proposals = deals.filter((d) => d.status === 'paid' && d.incomeStatus === null).length;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4" data-testid="funnel-view">
      <div className="flex flex-wrap items-center gap-3">
        <TabGroup
          className="inline-flex rounded-lg border border-line bg-surface p-0.5"
          role="tablist"
        >
          {(
            [
              ['funnel', 'Воронка', base],
              ['table', 'Таблица', `${base}?view=table`],
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
              data-testid={`funnel-tab-${key}`}
            >
              {label}
            </TabLink>
          ))}
        </TabGroup>
        {view === 'funnel' && deals.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-8 w-auto min-w-44 text-sm"
              aria-label="Откуда пришёл"
              data-testid="funnel-filter-source"
            >
              <option value="">Все источники</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Select
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              className="h-8 w-auto min-w-44 text-sm"
              aria-label="Кто ведёт"
              data-testid="funnel-filter-manager"
            >
              <option value="">Все менеджеры</option>
              {managers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            {(source || manager) && (
              <button
                type="button"
                className="text-brand hover:underline"
                onClick={() => {
                  setSource('');
                  setManager('');
                }}
              >
                Сбросить
              </button>
            )}
          </div>
        )}
        {proposals > 0 && (
          <Link
            href={`/forums/${forum.id}/income?view=fact`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-status-green/30 bg-status-green/10 px-3 py-1.5 text-sm text-status-green hover:bg-status-green/15"
            data-testid="funnel-proposals-link"
          >
            {proposals} {pluralRu(proposals, 'оплата ждёт', 'оплаты ждут', 'оплат ждут')} решения в
            факте доходов
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>

      {view === 'table' ? (
        <DealsTable
          deals={deals}
          setDeals={setDeals}
          items={items}
          directionLabel={directionLabel}
        />
      ) : deals.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line bg-white p-10 text-center text-sm text-ink/60">
          В воронке пока нет сделок. Добавьте их во вкладке{' '}
          <Link href={`${base}?view=table`} className="text-brand hover:underline">
            «Таблица»
          </Link>{' '}
          — вручную или загрузкой свода из Excel.
        </div>
      ) : (
        <FunnelBoard
          deals={filtered}
          today={today}
          forumStart={forum.startDate}
          planSum={source || manager ? 0 : planSum}
          directionLabel={directionLabel}
          incomeHref={`/forums/${forum.id}/income?view=fact`}
        />
      )}
    </div>
  );
}

function FunnelBoard({
  deals,
  today,
  forumStart,
  planSum,
  directionLabel,
  incomeHref,
}: {
  deals: DealValue[];
  today: string;
  forumStart: string;
  planSum: number;
  directionLabel: (key: string | null) => string;
  incomeHref: string;
}) {
  const stats = React.useMemo(() => funnelStats(deals, today), [deals, today]);
  const advice = React.useMemo(
    () => funnelAdvice(deals, today, { forumStart, planSum }),
    [deals, today, forumStart, planSum],
  );
  const firstProblem = advice.find((a) => a.stage && a.level === 'problem')?.stage;
  const [selected, setSelected] = React.useState<Selected>(
    (firstProblem as Selected | undefined) ?? 'qualification',
  );

  const paid = deals.filter((d) => d.status === 'paid');
  const refused = deals.filter((d) => d.status === 'refused');
  const active = deals.filter((d) => d.status !== 'paid' && d.status !== 'refused');
  const late = deals.filter((d) => d.status === 'agreement' || d.status === 'invoice');
  const stale = active.filter((d) => isStale(d, today));
  const closed = paid.length + refused.length;

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Вошли в воронку" value={String(deals.length)} note={dealsWord(deals.length)} />
        <Kpi
          label="В работе"
          value={String(active.length)}
          note={`${formatRubShort(sumAmount(late))} — согласование и счета`}
        />
        <Kpi
          label="Продажи"
          value={String(paid.length)}
          note={`${formatRub(sumAmount(paid))} · ${sumQty(paid)} шт.`}
          tone="green"
          onClick={() => setSelected('paid')}
        />
        <Kpi
          label="Отказы"
          value={String(refused.length)}
          note={closed ? `${pct(refused.length / closed)} закрытых сделок` : '—'}
          tone="red"
          onClick={() => setSelected('refused')}
        />
        <Kpi
          label="Конверсия в оплату"
          value={pct(deals.length ? paid.length / deals.length : 0)}
          note={closed ? `из закрытых — ${pct(paid.length / closed)}` : 'закрытых сделок нет'}
        />
        <Kpi
          label="Зависли"
          value={String(stale.length)}
          note="дольше нормы на этапе"
          tone={stale.length ? 'amber' : undefined}
        />
      </div>

      {advice.length > 0 && <AdvicePanel advice={advice} onSelect={setSelected} />}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)]">
        <section className="rounded-lg border border-line bg-white p-4">
          <h2 className="font-semibold">Воронка продаж</h2>
          <p className="text-xs text-ink/50">
            Нажмите на этап, чтобы посмотреть сделки, направления и источники
          </p>
          <FunnelChart stats={stats} selected={selected} onSelect={setSelected} />
          <button
            type="button"
            onClick={() => setSelected('refused')}
            className={cn(
              'mt-2 flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition',
              selected === 'refused'
                ? 'border-status-red bg-status-red/10'
                : 'border-status-red/30 bg-status-red/5 hover:bg-status-red/10',
            )}
            data-testid="funnel-refused"
          >
            <XCircle className="size-5 shrink-0 text-status-red" />
            <span className="font-semibold text-status-red">Отказы: {refused.length}</span>
            <span className="text-ink/60">
              {stats
                .filter((s) => s.lost)
                .map((s) => `${s.label.toLowerCase()} — ${s.lost}`)
                .join(' · ')}
            </span>
            <ArrowRight className="ml-auto size-4 text-ink/40" />
          </button>
        </section>
        <StageDetail
          selected={selected}
          deals={deals}
          stat={selected === 'refused' ? null : stats[stageIndex(selected)]}
          today={today}
          directionLabel={directionLabel}
          incomeHref={incomeHref}
        />
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  note,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'green' | 'red' | 'amber';
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-lg border border-line bg-white px-4 py-3 text-left',
        onClick && 'transition hover:border-brand/40',
      )}
    >
      <div className="text-xs text-ink/60">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-2xl font-semibold tabular-nums',
          tone === 'green' && 'text-status-green',
          tone === 'red' && 'text-status-red',
          tone === 'amber' && 'text-amber-600',
        )}
      >
        {value}
      </div>
      <div className="line-clamp-2 text-xs text-ink/50" title={note}>
        {note}
      </div>
    </Tag>
  );
}

function AdvicePanel({
  advice,
  onSelect,
}: {
  advice: FunnelAdvice[];
  onSelect: (s: Selected) => void;
}) {
  const icon = {
    problem: <TrendingDown className="mt-0.5 size-4 shrink-0 text-status-red" />,
    warning: <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />,
    good: <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-green" />,
  };
  return (
    <section
      className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm"
      data-testid="funnel-advice"
    >
      <h3 className="flex items-center gap-2 font-semibold text-amber-900">
        <Lightbulb className="size-4" />
        Что мешает продажам — рекомендации
      </h3>
      <ul className="mt-2 grid gap-x-6 gap-y-2 xl:grid-cols-2">
        {advice.map((a) => (
          <li key={a.title} className="flex gap-2">
            {icon[a.level]}
            <div>
              {a.stage ? (
                <button
                  type="button"
                  className="text-left font-medium text-ink hover:underline"
                  onClick={() => onSelect(a.stage as Selected)}
                >
                  {a.title}
                </button>
              ) : (
                <span className="font-medium text-ink">{a.title}</span>
              )}
              <p className="text-ink/70">{a.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Тёмный оттенок цвета этапа для верхнего обода */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v * k);
  return `rgb(${ch((n >> 16) & 255)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

/**
 * Воронка из объёмных слоёв: ширина слоя — сколько сделок дошло до этапа (корень, чтобы
 * нижние этапы оставались различимы), справа — подписи с количеством, суммой и конверсией.
 */
function FunnelChart({
  stats,
  selected,
  onSelect,
}: {
  stats: StageStat[];
  selected: Selected;
  onSelect: (s: Selected) => void;
}) {
  const W = 600;
  const cx = 160;
  const maxW = 300;
  const minW = 70;
  const h = 64;
  const gap = 10;
  const top = 14;
  const max = Math.max(1, stats[0].reached);
  const widths = stats.map((s) => minW + (maxW - minW) * Math.sqrt(s.reached / max));
  const ry = 11;
  const spoutW = 34;
  const H = top + stats.length * (h + gap) + 34;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-2 w-full"
      role="img"
      aria-label="Воронка продаж по этапам"
      data-testid="funnel-chart"
    >
      {stats.map((s, i) => {
        const y = top + i * (h + gap);
        const wt = widths[i];
        const wb = i + 1 < stats.length ? widths[i + 1] * 0.92 : spoutW;
        const active = selected === s.key;
        const dim = selected !== s.key;
        const body = `M ${cx - wt / 2} ${y} L ${cx - wb / 2} ${y + h} A ${wb / 2} ${ry * (wb / wt)} 0 0 0 ${cx + wb / 2} ${y + h} L ${cx + wt / 2} ${y} Z`;
        const labelY = y + h / 2;
        const lx = cx + Math.max(wt, wb) / 2;
        return (
          <g
            key={s.key}
            onClick={() => onSelect(s.key)}
            className="cursor-pointer"
            data-testid={`funnel-stage-${s.key}`}
            role="button"
            aria-label={`${s.label}: ${s.reached}`}
          >
            {/* Вся строка этапа кликабельна, не только слой */}
            <rect x={0} y={y - ry} width={W} height={h + gap} fill="transparent" />
            <path d={body} fill={s.color} opacity={dim ? 0.8 : 1} />
            <ellipse
              cx={cx}
              cy={y}
              rx={wt / 2}
              ry={ry}
              fill={shade(s.color, 0.72)}
              opacity={dim ? 0.85 : 1}
            />
            {active && (
              <path d={body} fill="none" stroke="#111" strokeWidth={2} strokeLinejoin="round" />
            )}
            <text
              x={cx}
              y={y + h / 2 + 8}
              textAnchor="middle"
              className="fill-white font-semibold"
              style={{ fontSize: 22 }}
            >
              {s.reached}
            </text>
            {/* Выноска */}
            <polyline
              points={`${lx - 6},${labelY} ${lx + 18},${labelY} ${330},${y + 12}`}
              fill="none"
              stroke={s.color}
              strokeWidth={1.5}
            />
            <circle cx={334} cy={y + 12} r={4} fill={s.color} />
            <text
              x={346}
              y={y + 17}
              className="font-semibold"
              style={{ fontSize: 15 }}
              fill={s.color}
            >
              {s.label}
            </text>
            <text x={346} y={y + 36} style={{ fontSize: 12 }} fill="#111" fillOpacity={0.75}>
              {s.current
                ? `сейчас ${s.current} ${dealsWord(s.current)}${s.currentAmount ? ` · ${formatRubShort(s.currentAmount)}` : ''}`
                : 'сейчас сделок нет'}
            </text>
            <text x={346} y={y + 53} style={{ fontSize: 12 }}>
              {s.conversion !== null && (
                <tspan
                  fill={s.conversion < 0.4 ? '#D93838' : s.conversion < 0.7 ? '#B45309' : '#1E9E5A'}
                  fontWeight={600}
                >
                  {`${pct(s.conversion)} от прошлого этапа`}
                </tspan>
              )}
              {s.lost > 0 && (
                <tspan fill="#D93838">{`${s.conversion !== null ? ' · ' : ''}отказ ${s.lost}`}</tspan>
              )}
              {s.stale > 0 && <tspan fill="#B45309">{` · зависли ${s.stale}`}</tspan>}
            </text>
          </g>
        );
      })}
      {/* Носик воронки */}
      <rect
        x={cx - spoutW / 2 + 6}
        y={top + stats.length * (h + gap) - gap + 4}
        width={spoutW - 12}
        height={22}
        rx={4}
        fill={stats[stats.length - 1].color}
        opacity={0.9}
      />
    </svg>
  );
}

function StageDetail({
  selected,
  deals,
  stat,
  today,
  directionLabel,
  incomeHref,
}: {
  selected: Selected;
  deals: DealValue[];
  stat: StageStat | null;
  today: string;
  directionLabel: (key: string | null) => string;
  incomeHref: string;
}) {
  const current = deals.filter((d) => d.status === selected);
  const lostHere =
    selected === 'refused'
      ? []
      : deals.filter((d) => d.status === 'refused' && reachedIndex(d) === stageIndex(selected));
  const [mode, setMode] = React.useState<'current' | 'lost'>('current');
  // Новый этап: показываем, кто на нём сейчас, а если никого — кто на нём отказался
  React.useEffect(
    () => setMode(current.length || !lostHere.length ? 'current' : 'lost'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected],
  );
  const showLost = mode === 'lost' && lostHere.length > 0;
  const list = (showLost ? lostHere : current).sort(
    (a, b) => (daysInStage(b, today) ?? -1) - (daysInStage(a, today) ?? -1),
  );
  const dateCol =
    selected === 'paid' ? 'paid' : selected === 'refused' || showLost ? 'decision' : 'days';
  const meta = selected === 'refused' ? REFUSED : DEAL_STAGES[stageIndex(selected)];
  const staleList = list.filter((d) => isStale(d, today));
  const dirs = breakdown(list, (d) => directionLabel(d.incomeKey));
  const sources = breakdown(list, (d) => d.source);
  const managers = breakdown(list, (d) => d.manager);
  const lostAt =
    selected === 'refused'
      ? breakdown(list, (d) => (d.lostStage ? statusLabel(d.lostStage) : 'Квалификация'))
      : [];
  const waiting = current.filter((d) => d.status === 'paid' && d.incomeStatus === null).length;

  return (
    <section
      className="min-w-0 rounded-lg border border-line bg-white p-4"
      data-testid="funnel-detail"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="h-4 w-1.5 rounded-sm" style={{ background: meta.color }} />
          {meta.label}
        </h2>
        <span className="text-sm text-ink/70">
          сейчас {current.length} {dealsWord(current.length)}
          {sumAmount(current) > 0 && ` · ${formatRub(sumAmount(current))}`}
          {sumQty(current) > 0 && ` · ${sumQty(current)} шт.`}
        </span>
        {stat && (
          <span className="text-sm text-ink/60">
            дошли до этапа {stat.reached}
            {stat.conversion !== null && ` (${pct(stat.conversion)} от прошлого этапа)`}
          </span>
        )}
      </div>
      {lostHere.length > 0 && (
        <div className="mt-2 inline-flex rounded-md border border-line bg-surface p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setMode('current')}
            className={cn(
              'rounded px-3 py-1',
              !showLost ? 'bg-white font-medium text-brand shadow-sm' : 'text-ink/70',
            )}
          >
            Сейчас на этапе · {current.length}
          </button>
          <button
            type="button"
            onClick={() => setMode('lost')}
            className={cn(
              'rounded px-3 py-1',
              showLost ? 'bg-white font-medium text-status-red shadow-sm' : 'text-ink/70',
            )}
            data-testid="funnel-detail-lost"
          >
            Отказались на этапе · {lostHere.length}
          </button>
        </div>
      )}
      {!showLost && staleList.length > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-amber-700">
          <Clock className="size-4" />
          {staleList.length} {dealsWord(staleList.length)} дольше{' '}
          {DEAL_STAGES[stageIndex(selected as DealStageKey)].staleDays} дней на этапе
        </p>
      )}
      {selected === 'paid' && waiting > 0 && (
        <Link
          href={incomeHref}
          className="mt-1 inline-flex items-center gap-1 text-sm text-status-green hover:underline"
        >
          {waiting} {pluralRu(waiting, 'оплата ждёт', 'оплаты ждут', 'оплат ждут')} решения в факте
          доходов
          <ArrowRight className="size-3.5" />
        </Link>
      )}

      {list.length === 0 ? (
        <p className="mt-4 text-sm text-ink/60">Сейчас на этом этапе сделок нет.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {selected === 'refused' && <Bars title="На каком этапе отказались" rows={lostAt} />}
            <Bars title="Направления доходов" rows={dirs} showAmount />
            <Bars title="Кто привёл (откуда пришли)" rows={sources} />
            <Bars title="Кто ведёт" rows={managers} />
          </div>
          <div className="thin-scroll mt-4 max-h-[420px] overflow-auto rounded-md border border-line">
            <table className="w-full min-w-[640px] text-sm" data-testid="funnel-detail-deals">
              <thead className="sticky top-0 bg-surface text-xs text-ink/60">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Компания</th>
                  <th className="px-2 py-1.5 text-left font-medium">Откуда</th>
                  <th className="px-2 py-1.5 text-left font-medium">Кто ведёт</th>
                  <th className="px-2 py-1.5 text-right font-medium">Шт.</th>
                  <th className="px-2 py-1.5 text-right font-medium">Сумма</th>
                  <th className="px-2 py-1.5 text-right font-medium">
                    {dateCol === 'paid'
                      ? 'Оплата'
                      : dateCol === 'decision'
                        ? 'Решение'
                        : 'Дней на этапе'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((d) => {
                  const days = daysInStage(d, today);
                  const st = isStale(d, today);
                  return (
                    <tr key={d.id} className="border-t border-line">
                      <td className="max-w-[280px] truncate px-2 py-1.5" title={d.company}>
                        {d.company}
                        {d.status === 'paid' && (
                          <span
                            className={cn(
                              'ml-2 rounded px-1.5 py-0.5 text-[11px]',
                              d.incomeStatus === 'added'
                                ? 'bg-status-green/10 text-status-green'
                                : d.incomeStatus === 'rejected'
                                  ? 'bg-surface text-ink/50'
                                  : 'bg-amber-100 text-amber-800',
                            )}
                          >
                            {d.incomeStatus === 'added'
                              ? 'в факте'
                              : d.incomeStatus === 'rejected'
                                ? 'отклонено'
                                : 'ждёт решения'}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-ink/70">{d.source}</td>
                      <td className="px-2 py-1.5 text-ink/70">{d.manager}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{d.qty || ''}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                        {d.amount ? formatRub(d.amount) : ''}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-2 py-1.5 text-right tabular-nums',
                          st && dateCol === 'days' && 'font-medium text-amber-700',
                        )}
                      >
                        {dateCol === 'paid'
                          ? formatDate(d.paidDate)
                          : dateCol === 'decision'
                            ? formatDate(d.decisionDate) || '—'
                            : (days ?? '—')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Bars({
  title,
  rows,
  showAmount,
}: {
  title: string;
  rows: Breakdown[];
  showAmount?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const shown = rows.slice(0, 6);
  const rest = rows.slice(6);
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-ink/50">{title}</h3>
      <ul className="mt-1.5 space-y-1.5">
        {shown.map((r) => (
          <li key={r.name} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate" title={r.name}>
                {r.name}
              </span>
              <span className="font-medium tabular-nums">{r.count}</span>
              {showAmount && r.amount > 0 && (
                <span className="w-20 text-right text-xs tabular-nums text-ink/60">
                  {formatRubShort(r.amount)}
                </span>
              )}
            </div>
            <div className="mt-0.5 h-1.5 rounded-full bg-surface">
              <div
                className="h-1.5 rounded-full bg-brand/70"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
        {rest.length > 0 && (
          <li className="text-xs text-ink/50">
            ещё {rest.length}: {rest.map((r) => `${r.name} (${r.count})`).join(', ')}
          </li>
        )}
      </ul>
    </div>
  );
}
