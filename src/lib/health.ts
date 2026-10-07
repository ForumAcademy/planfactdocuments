import { diffDays, type ISODate } from './dates';
import { countStatuses, isOverdue, shouldStart, type StatusInput } from './status';
import {
  autoPlan,
  currentStage,
  hasStages,
  incomeSum,
  incomeTarget,
  salesAdvice,
  stageDates,
  withDeals,
  type IncomeConfig,
  type IncomeItemValue,
  type PaidDealInput,
} from './income';

/**
 * Линии статуса форума над вкладками: задачи, расходы, доходы.
 * Цвет: зелёный — всё идёт как запланировано, жёлтый — проверить сроки и цифры,
 * красный — есть отставания.
 */
export type Health = 'green' | 'yellow' | 'red';

export const HEALTH_LABEL: Record<Health, string> = {
  green: 'Всё по плану',
  yellow: 'Проверить сроки и цифры',
  red: 'Есть отставания',
};

export interface HealthLine {
  health: Health;
  /** Заполнение линии, 0…1 */
  fill: number;
  /** Где должна быть линия на сегодня (0…1), если это можно посчитать */
  mark: number | null;
  /** Подпись отметки */
  markLabel?: string;
  /** Главная цифра коротко: «59 из 149», «10,9 из 18,5 млн ₽» */
  value: string;
  /** Коротко, почему такой цвет: «Просрочено 50», «По плану» */
  badge: string;
  /** Все цифры — для подсказки */
  summary: string;
  /** Почему такой цвет */
  reasons: string[];
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const share = (part: number, total: number) => (total > 0 ? part / total : 0);
const percent = (v: number) => `${Math.round(v * 100)}%`;
const rub = (v: number) => {
  const a = Math.abs(v);
  const s =
    a >= 1_000_000
      ? `${(Math.round(a / 100_000) / 10).toLocaleString('ru-RU')} млн`
      : a >= 1_000
        ? `${Math.round(a / 1_000).toLocaleString('ru-RU')} тыс.`
        : `${Math.round(a)}`;
  return `${v < 0 ? '−' : ''}${s} ₽`;
};
const plural = (n: number, one: string, few: string, many: string) => {
  const m100 = Math.abs(n) % 100;
  const m10 = m100 % 10;
  if (m100 > 10 && m100 < 20) return many;
  if (m10 > 1 && m10 < 5) return few;
  if (m10 === 1) return one;
  return many;
};
/** «10,9 из 18,5 млн ₽» — обе суммы в одних единицах */
const rubOf = (part: number, total: number) => {
  const m = Math.max(Math.abs(part), Math.abs(total));
  const [div, unit] =
    m >= 1_000_000 ? [1_000_000, 'млн '] : m >= 1_000 ? [1_000, 'тыс. '] : [1, ''];
  const f = (v: number) => (Math.round((v / div) * 10) / 10).toLocaleString('ru-RU');
  return `${f(part)} из ${f(total)} ${unit}₽`;
};
const tasksWord = (n: number) => `${n} ${plural(n, 'задача', 'задачи', 'задач')}`;

/** Расходы, которые близки к пределу: от этой доли предельных — «проверить» */
export const EXPENSE_WARN_SHARE = 0.9;
/** Доходы: факт ниже этой доли от ожидаемого на сегодня — отставание */
export const INCOME_RED_SHARE = 0.7;
/** Задачи: срок через столько дней, а задача ещё не начата — «проверить» */
export const TASK_SOON_DAYS = 3;

/**
 * Линия задач. Красный — есть просроченные; жёлтый — пора начинать (дата начала прошла,
 * задача не начата) или срок через 3 дня, а задача не начата; иначе зелёный.
 * Заполнение — доля выполненных, отметка — доля задач, срок которых уже прошёл.
 */
export function taskHealth(tasks: StatusInput[], today: ISODate): HealthLine {
  const c = countStatuses(tasks, today);
  const late = tasks.filter((t) => !isOverdue(t, today) && shouldStart(t, today)).length;
  const soon = tasks.filter(
    (t) =>
      t.status === 'NOT_STARTED' &&
      t.endDate !== null &&
      t.endDate >= today &&
      diffDays(today, t.endDate) <= TASK_SOON_DAYS &&
      !shouldStart(t, today),
  ).length;
  const due = tasks.filter((t) => t.endDate !== null && t.endDate < today).length;
  const reasons: string[] = [];
  if (c.overdue) reasons.push(`просрочено: ${tasksWord(c.overdue)}`);
  if (late) reasons.push(`пора начинать: ${tasksWord(late)}`);
  if (soon) reasons.push(`срок в ближайшие ${TASK_SOON_DAYS} дня, не начато: ${tasksWord(soon)}`);
  const health: Health = c.overdue ? 'red' : late || soon ? 'yellow' : 'green';
  const badge = c.overdue
    ? `Просрочено ${c.overdue}`
    : late
      ? `Пора начинать ${late}`
      : soon
        ? `Скоро срок ${soon}`
        : 'По плану';
  if (health === 'green') reasons.push(c.total ? 'просроченных задач нет' : 'задач пока нет');
  return {
    health,
    fill: share(c.done, c.total),
    mark: c.total ? share(due, c.total) : null,
    markLabel: 'Должно быть выполнено к сегодняшнему дню',
    value: `${c.done} из ${c.total} выполнено`,
    badge,
    summary: `Выполнено ${c.done} из ${c.total} (${percent(share(c.done, c.total))}) · в работе ${c.inProgress} · не начато ${c.notStarted} · просрочено ${c.overdue}`,
    reasons,
  };
}

export interface ExpenseTaskInput {
  cost: number;
  costFact: number;
}

/**
 * Линия расходов. Предел — предельно допустимые расходы, а пока они не заданы — план
 * (стоимость задач). Красный — факт или план больше предела; жёлтый — предел не задан, факт
 * больше плана, у задач факт больше их плана или факт дошёл до 90% предела; иначе зелёный.
 * Заполнение — факт от предела, отметка — план.
 */
export function expenseHealth(tasks: ExpenseTaskInput[], limit: number | null): HealthLine {
  const plan = tasks.reduce((s, t) => s + t.cost, 0);
  const fact = tasks.reduce((s, t) => s + (t.costFact ?? 0), 0);
  const over = tasks.filter((t) => (t.costFact ?? 0) > t.cost).length;
  const cap = limit ?? plan;
  const reasons: string[] = [];
  let health: Health = 'green';
  let badge = 'По плану';
  const red = (s: string, b: string) => {
    if (health !== 'red') badge = b;
    health = 'red';
    reasons.push(s);
  };
  const warn = (s: string, b: string) => {
    if (health === 'green') {
      health = 'yellow';
      badge = b;
    }
    reasons.push(s);
  };
  if (cap > 0 && fact > cap)
    red(`факт больше предельных на ${rub(fact - cap)}`, `Сверх лимита ${rub(fact - cap)}`);
  if (limit != null && plan > limit)
    red(`план больше предельных на ${rub(plan - limit)}`, 'План выше лимита');
  if (!plan && !fact) warn('не заполнена стоимость задач', 'Нет стоимости задач');
  else if (limit == null) warn('не заданы предельно допустимые расходы', 'Лимит не задан');
  if (plan > 0 && fact > plan && !(cap > 0 && fact > cap))
    warn(`факт больше плана на ${rub(fact - plan)}`, 'Факт выше плана');
  if (over)
    warn(
      `факт больше плана в ${over} ${plural(over, 'задаче', 'задачах', 'задачах')}`,
      'Факт выше плана',
    );
  if (health === 'green' && cap > 0 && fact >= cap * EXPENSE_WARN_SHARE)
    warn(`израсходовано ${percent(share(fact, cap))} предельных`, 'Близко к лимиту');
  if (health === 'green') reasons.push('расходы в пределах плана');
  return {
    health,
    fill: clamp01(share(fact, cap)),
    mark: cap > 0 && plan > 0 ? clamp01(share(plan, cap)) : null,
    markLabel: 'План (стоимость задач)',
    value: cap > 0 ? rubOf(fact, cap) : rub(fact),
    badge,
    summary:
      `Факт ${rub(fact)} · план ${rub(plan)} · предельно ${limit != null ? rub(limit) : 'не заданы'}` +
      (cap > 0 ? ` · ${percent(share(fact, cap))} предельных` : ''),
    reasons,
  };
}

/** Доля периода [from, to), прошедшая к сегодняшнему дню */
function elapsed(from: ISODate, to: ISODate, today: ISODate): number {
  if (today >= to) return 1;
  if (today <= from) return 0;
  return clamp01(diffDays(from, today) / Math.max(1, diffDays(from, to)));
}

/**
 * Сколько должно быть продано к сегодняшнему дню по плану: партнёрства — равномерно от старта
 * продаж до форума, билеты — равномерно внутри своей стадии цен.
 */
export function expectedIncome(
  items: IncomeItemValue[],
  dates: [ISODate, ISODate, ISODate],
  forumStart: ISODate,
  today: ISODate,
): number {
  const ends: [ISODate, ISODate, ISODate] = [dates[1], dates[2], forumStart];
  const parts = incomeSum(
    items.filter((i) => !hasStages(i)),
    'plan',
  );
  const tickets = items.filter(hasStages);
  return Math.round(
    parts * elapsed(dates[0], forumStart, today) +
      [0, 1, 2].reduce(
        (s, k) => s + incomeSum(tickets, 'plan', k) * elapsed(dates[k], ends[k], today),
        0,
      ),
  );
}

/**
 * Линия доходов. Цель — предельно допустимые расходы (пока не заданы — стоимость задач) + 30%, план — с автоподбором, как во вкладке
 * «Доходы». Красный — факт меньше 70% от ожидаемого на сегодня (или продажи закончились, а цель
 * не достигнута); жёлтый — факт меньше ожидаемого или план меньше цели; иначе зелёный.
 * Заполнение — факт от плана, отметка — ожидаемое на сегодня.
 */
export function incomeHealth(input: {
  items: IncomeItemValue[];
  config: IncomeConfig;
  deals: PaidDealInput[];
  expenses: number;
  salesStart: ISODate;
  forumStart: ISODate;
  today: ISODate;
}): HealthLine & { advice: string[] } {
  const { items, config, deals, expenses, salesStart, forumStart, today } = input;
  const dates = stageDates(config, salesStart, forumStart);
  const target = incomeTarget(expenses);
  const planned = autoPlan(
    withDeals(items, deals, dates, today),
    target,
    currentStage(dates, today),
  );
  const plan = incomeSum(planned, 'plan');
  const fact = incomeSum(planned, 'fact');
  const expected = Math.min(plan, expectedIncome(planned, dates, forumStart, today));
  const advice = salesAdvice(planned, target, dates, forumStart, today);
  const reasons: string[] = [];
  let health: Health = 'green';
  let badge = 'По плану';
  const ended = today >= forumStart;
  if (ended && target > 0 && fact < target) {
    health = 'red';
    reasons.push(`продажи завершены, до цели не хватило ${rub(target - fact)}`);
    badge = 'Цель не достигнута';
  } else if (expected > 0 && fact < expected * INCOME_RED_SHARE) {
    health = 'red';
    reasons.push(`к сегодня ожидалось ${rub(expected)}, отставание ${rub(expected - fact)}`);
    badge = `Отставание ${rub(expected - fact)}`;
  } else if (expected > 0 && fact < expected) {
    health = 'yellow';
    reasons.push(`к сегодня ожидалось ${rub(expected)}, не хватает ${rub(expected - fact)}`);
    badge = `Не хватает ${rub(expected - fact)}`;
  }
  if (!target) {
    if (health === 'green') {
      health = 'yellow';
      badge = 'Нет цели';
    }
    reasons.push('нет цели — заполните стоимость задач в «Расходах»');
  } else if (plan < target) {
    if (health === 'green') {
      health = 'yellow';
      badge = 'План ниже цели';
    }
    reasons.push(`план меньше цели на ${rub(target - plan)}`);
  }
  if (health === 'green')
    reasons.push(
      today < salesStart
        ? 'продажи ещё не начались, план покрывает цель'
        : 'продажи идут не хуже плана',
    );
  return {
    health,
    fill: clamp01(share(fact, plan)),
    mark: plan > 0 && today >= salesStart ? clamp01(share(expected, plan)) : null,
    markLabel: `Ожидалось к сегодняшнему дню: ${rub(expected)}`,
    value: plan > 0 ? rubOf(fact, plan) : rub(fact),
    badge,
    summary: `Факт ${rub(fact)} · план ${rub(plan)} (${percent(share(fact, plan))}) · цель ${rub(target)}`,
    reasons,
    advice,
  };
}
