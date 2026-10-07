import { diffDays } from './dates';
import { formatRubShort, pluralRu } from './utils';

/**
 * Воронка продаж форума. Каждая сделка — компания, которая вошла в воронку: откуда пришла,
 * кто её ведёт, направление дохода (позиция из «Доходов»), количество и сумма.
 * Сделка идёт по этапам «Квалификация» → … → «Оплачено» или выпадает в «Отказ»
 * (тогда запоминается, на каком этапе). Сделка на этапе N прошла все этапы до него, поэтому
 * этап воронки показывает, сколько сделок до него дошло, и сколько сейчас на нём стоит.
 */

export const DEAL_STAGES = [
  { key: 'qualification', label: 'Квалификация', color: '#5B6BD6', staleDays: 21 },
  { key: 'negotiation', label: 'Переговоры', color: '#3F7FD0', staleDays: 14 },
  { key: 'agreement', label: 'Согласование', color: '#2B95B5', staleDays: 14 },
  { key: 'invoice', label: 'Выставлен счёт', color: '#22A58C', staleDays: 10 },
  { key: 'paid', label: 'Оплачено', color: '#1E9E5A', staleDays: 0 },
] as const;
export type DealStageKey = (typeof DEAL_STAGES)[number]['key'];
export type DealStatus = DealStageKey | 'refused';

export const REFUSED = { key: 'refused', label: 'Отказ', color: '#D93838' } as const;
export const DEAL_STATUSES: { key: DealStatus; label: string; color: string }[] = [
  ...DEAL_STAGES,
  REFUSED,
];

export function isDealStage(v: unknown): v is DealStageKey {
  return DEAL_STAGES.some((s) => s.key === v);
}
export function isDealStatus(v: unknown): v is DealStatus {
  return v === 'refused' || isDealStage(v);
}
export function stageIndex(key: DealStageKey): number {
  return DEAL_STAGES.findIndex((s) => s.key === key);
}
export function statusLabel(s: DealStatus): string {
  return DEAL_STATUSES.find((x) => x.key === s)?.label ?? s;
}

export type IncomeDecision = 'added' | 'rejected';

export interface DealValue {
  id: number;
  company: string;
  source: string;
  manager: string;
  enteredAt: string | null;
  incomeKey: string | null;
  qty: number;
  amount: number;
  status: DealStatus;
  /** На каком этапе отказ; null — неизвестно (считается «Квалификацией») */
  lostStage: DealStageKey | null;
  stageChangedAt: string | null;
  decisionDate: string | null;
  paidDate: string | null;
  comment: string;
  incomeStatus: IncomeDecision | null;
  incomeItemKey: string | null;
}

/** Последний этап, до которого дошла сделка (для отказа — этап, на котором отказались) */
export function reachedIndex(d: Pick<DealValue, 'status' | 'lostStage'>): number {
  if (d.status === 'refused') return d.lostStage ? stageIndex(d.lostStage) : 0;
  return stageIndex(d.status);
}

/** Сколько дней сделка стоит на текущем этапе */
export function daysInStage(d: DealValue, today: string): number | null {
  const from = d.stageChangedAt ?? d.enteredAt;
  return from ? Math.max(0, diffDays(from, today)) : null;
}

/** Активная сделка стоит на этапе дольше нормы */
export function isStale(d: DealValue, today: string): boolean {
  if (d.status === 'refused' || d.status === 'paid') return false;
  const days = daysInStage(d, today);
  const norm = DEAL_STAGES[stageIndex(d.status)].staleDays;
  return days !== null && days > norm;
}

export interface StageStat {
  key: DealStageKey;
  label: string;
  color: string;
  /** Дошли до этапа (включая тех, кто дальше, и отказавшихся на этом этапе и позже) */
  reached: number;
  /** Стоят на этапе сейчас (без отказов) */
  current: number;
  currentAmount: number;
  /** Отказались на этом этапе */
  lost: number;
  /** Доля перешедших с предыдущего этапа, 0..1; для первого — null */
  conversion: number | null;
  stale: number;
}

export function funnelStats(deals: DealValue[], today: string): StageStat[] {
  return DEAL_STAGES.map((s, k) => {
    const here = deals.filter((d) => d.status === s.key);
    const reached = deals.filter((d) => reachedIndex(d) >= k).length;
    const prev = k ? deals.filter((d) => reachedIndex(d) >= k - 1).length : 0;
    return {
      key: s.key,
      label: s.label,
      color: s.color,
      reached,
      current: here.length,
      currentAmount: sumAmount(here),
      lost: deals.filter((d) => d.status === 'refused' && reachedIndex(d) === k).length,
      conversion: k ? (prev ? reached / prev : 0) : null,
      stale: here.filter((d) => isStale(d, today)).length,
    };
  });
}

export const sumAmount = (list: Pick<DealValue, 'amount'>[]) =>
  list.reduce((s, d) => s + d.amount, 0);
export const sumQty = (list: Pick<DealValue, 'qty'>[]) => list.reduce((s, d) => s + d.qty, 0);

export interface Breakdown {
  name: string;
  count: number;
  qty: number;
  amount: number;
}

/** Разбивка сделок по полю: по убыванию количества */
export function breakdown(list: DealValue[], key: (d: DealValue) => string): Breakdown[] {
  const map = new Map<string, Breakdown>();
  for (const d of list) {
    const name = key(d) || 'Не указано';
    const b = map.get(name) ?? { name, count: 0, qty: 0, amount: 0 };
    b.count++;
    b.qty += d.qty;
    b.amount += d.amount;
    map.set(name, b);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const deals = (n: number) => `${n} ${pluralRu(n, 'сделка', 'сделки', 'сделок')}`;
const rub = formatRubShort;

export interface FunnelAdvice {
  /** Этап, к которому относится совет (для подсветки в воронке) */
  stage: DealStageKey | 'refused' | null;
  level: 'problem' | 'warning' | 'good';
  title: string;
  text: string;
}

/** Что мешает переходу с этапа на этап — подсказка по самому слабому переходу */
const STEP_HINTS: Record<DealStageKey, string> = {
  qualification: '',
  negotiation: 'Звоните в день заявки, отсеивайте лиды без ЛПР.',
  agreement: 'Покажите ценность: программа, кейсы, пакет билетов.',
  invoice: 'Выйдите на ЛПР и договоритесь о дате решения.',
  paid: 'Созвонитесь с бухгалтерией, напомните о повышении цены.',
};

/**
 * Рекомендации: где воронка теряет больше всего, где сделки зависли, какие источники дают
 * отказы, а какие — продажи, хватит ли сделок в работе до плана.
 */
export function funnelAdvice(
  list: DealValue[],
  today: string,
  opts: { forumStart: string; planSum: number },
): FunnelAdvice[] {
  const out: FunnelAdvice[] = [];
  if (!list.length) return out;
  const stats = funnelStats(list, today);

  // 1. Самый слабый переход между этапами (среди тех, где есть движение)
  const steps = stats.slice(1).filter((s, i) => stats[i].reached >= 5);
  const weakest = steps.reduce<StageStat | null>(
    (w, s) => (w === null || (s.conversion ?? 1) < (w.conversion ?? 1) ? s : w),
    null,
  );
  if (weakest && (weakest.conversion ?? 1) < 0.6) {
    const k = stageIndex(weakest.key);
    const from = stats[k - 1];
    out.push({
      stage: from.key,
      level: 'problem',
      title: `«${from.label}» → «${weakest.label}»: проходит ${pct(weakest.conversion ?? 0)}`,
      text: `${weakest.reached} из ${from.reached}. ${STEP_HINTS[weakest.key]}`,
    });
  }

  // 2. Зависшие сделки на каждом этапе
  for (const s of stats) {
    if (!s.stale) continue;
    const st = DEAL_STAGES[stageIndex(s.key)];
    const here = list.filter((d) => d.status === s.key && isStale(d, today));
    const byMgr = breakdown(here, (d) => d.manager)[0];
    out.push({
      stage: s.key,
      level: s.key === 'invoice' || s.stale >= 10 ? 'problem' : 'warning',
      title: `«${s.label}»: ${s.stale} зависли дольше ${st.staleDays} дн.`,
      text: [
        here.some((d) => d.amount) ? `На ${rub(sumAmount(here))}.` : '',
        byMgr && byMgr.count > 1 && byMgr.name !== 'Не указано'
          ? `Больше всего у ${byMgr.name} (${byMgr.count}).`
          : '',
        s.key === 'qualification'
          ? 'Перевести в переговоры или закрыть.'
          : 'Назначьте следующий шаг.',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  // 3. Источники: где больше всего отказов, а где лучше всего продают
  const bySource = new Map<string, DealValue[]>();
  for (const d of list) {
    const k = d.source || 'Не указано';
    bySource.set(k, [...(bySource.get(k) ?? []), d]);
  }
  const closed = [...bySource.entries()]
    .map(([name, ds]) => {
      const refused = ds.filter((d) => d.status === 'refused').length;
      const paid = ds.filter((d) => d.status === 'paid').length;
      return { name, total: ds.length, refused, paid, done: refused + paid };
    })
    .filter((s) => s.done >= 5);
  const worst = closed
    .filter((s) => s.refused / s.done >= 0.7)
    .sort((a, b) => b.refused - a.refused)[0];
  if (worst) {
    out.push({
      stage: 'refused',
      level: 'warning',
      title: `«${worst.name}»: ${worst.refused} отказов из ${worst.done}`,
      text: 'Проверьте сегмент и оффер.',
    });
  }
  const best = closed
    .filter((s) => s.paid >= 2)
    .sort((a, b) => b.paid / b.done - a.paid / a.done)[0];
  if (best && best.name !== worst?.name) {
    out.push({
      stage: 'paid',
      level: 'good',
      title: `«${best.name}» продаёт лучше всех: ${best.paid} оплат из ${best.done}`,
      text: 'Усильте канал, просите рекомендации.',
    });
  }

  // 4. Хватит ли сделок до плана продаж
  const paid = sumAmount(list.filter((d) => d.status === 'paid'));
  const late = sumAmount(list.filter((d) => d.status === 'agreement' || d.status === 'invoice'));
  const days = diffDays(today, opts.forumStart);
  if (opts.planSum > 0 && days >= 0) {
    const gap = opts.planSum - paid - late;
    out.push({
      stage: null,
      level: gap > 0 ? 'problem' : 'good',
      title: gap > 0 ? `До плана не хватает ${rub(gap)}` : 'Сделок в работе хватает до плана',
      text: `Оплачено ${pct(paid / opts.planSum)} плана, до форума ${days} ${pluralRu(days, 'день', 'дня', 'дней')}.${gap > 0 ? ' Нужны новые сделки.' : ''}`,
    });
  }

  // 5. Сделки без ответственного
  const orphan = list.filter((d) => !d.manager && d.status !== 'refused' && d.status !== 'paid');
  if (orphan.length) {
    out.push({
      stage: null,
      level: 'warning',
      title: `${deals(orphan.length)} без ответственного`,
      text: 'Назначьте, кто ведёт.',
    });
  }
  const rank = { problem: 0, warning: 1, good: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
