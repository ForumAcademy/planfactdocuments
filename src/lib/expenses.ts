/**
 * Расходы: направления (крупные статьи) и отнесение задач к ним.
 * Источник сумм — стоимость задач из «Линии задач» (план) и фактические расходы по задачам.
 */

export const EXPENSE_CATEGORIES = [
  {
    key: 'marketing',
    label: 'Маркетинг',
    hint: 'Реклама, сайт, продвижение, контент, фото и видео',
    color: '#2563EB',
  },
  {
    key: 'travel',
    label: 'Командировочные расходы',
    hint: 'Поездки команды, проживание, инспекционные визиты',
    color: '#0891B2',
  },
  {
    key: 'org',
    label: 'Организационные расходы',
    hint: 'Площадка, логистика, отели для участников, питание, техника, деловая программа',
    color: '#0A0A9F',
  },
  {
    key: 'print',
    label: 'Типография',
    hint: 'Ланьярды, бейджи, мерч, баннеры, раздаточные материалы',
    color: '#D97706',
  },
  {
    key: 'staff',
    label: 'Наемный персонал',
    hint: 'Найм, аутстаф, волонтёры, хостес, мотивация',
    color: '#DB2777',
  },
  {
    key: 'sales',
    label: 'Продажи и партнёрства',
    hint: 'CRM, телефония, рассылки, базы контактов, материалы для партнёров',
    color: '#1E9E5A',
  },
  {
    key: 'admin',
    label: 'Юридические и финансовые',
    hint: 'Договоры, юридическое сопровождение, бюджет и отчётность',
    color: '#64748B',
  },
  {
    key: 'other',
    label: 'Прочие расходы',
    hint: 'Всё, что не вошло в другие направления',
    color: '#A3A3A3',
  },
] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number]['key'];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const BY_KEY = new Map<string, ExpenseCategory>(EXPENSE_CATEGORIES.map((c) => [c.key, c]));

export function isExpenseCategory(v: unknown): v is ExpenseCategoryKey {
  return typeof v === 'string' && BY_KEY.has(v);
}

export function expenseCategory(key: ExpenseCategoryKey): ExpenseCategory {
  return BY_KEY.get(key)!;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/** Направление по названию из файла: «Типография», «типография », «Маркетинг»… */
export function expenseCategoryByLabel(label: string): ExpenseCategoryKey | null {
  const l = norm(label);
  if (!l) return null;
  return EXPENSE_CATEGORIES.find((c) => norm(c.label) === l || c.key === l)?.key ?? null;
}

/** Слова в описании задачи — проверяются по порядку, раньше блока. */
const KEYWORD_RULES: [ExpenseCategoryKey, RegExp][] = [
  ['print', /печат|типограф|полиграф|ланьярд|бейдж|(^|[^а-я])мерч|сувенир|баннер/],
  ['travel', /командиров|перел[её]т|суточн|проживани\S* команд|^провести инспекционный визит/],
  ['staff', /найм|наем|подбор\S* персонал|аутстаф|волонтер|хостес|промоутер|мотиваци/],
  [
    'marketing',
    /сайт|реклам|продвижени|таргет|smm|фотограф|видеограф|фото- и видео|инфопартн|соцсет|публикаци/,
  ],
  ['org', /отел|трансфер|транспорт|кейтеринг|питани|меню|площадк|спикер|модератор|экскурс/],
  ['sales', /crm|телефони|рассыл|аутрич|обзвон|партнер/],
];

/** Блок задачи → направление, если описание ничего не подсказало. */
const BLOCK_RULES: [ExpenseCategoryKey, RegExp][] = [
  ['print', /производство материалов|типограф|полиграф/],
  ['marketing', /маркетинг|контент|коммуникаци|pr|smm/],
  [
    'org',
    /площадка|логистика|питание|техническое обеспечение|регистрация|безопасность|монтаж|демонтаж|программа|спикер|репетиция|оперативная координация/,
  ],
  ['staff', /команда|персонал/],
  ['sales', /продаж|партнерств|билет/],
  ['admin', /юрид|финанс|бюджет|отчетност/],
];

/** Автоматическое направление задачи — по описанию, затем по блоку. */
export function autoExpenseCategory(description: string, block: string | null): ExpenseCategoryKey {
  const d = norm(description);
  for (const [key, re] of KEYWORD_RULES) if (re.test(d)) return key;
  const b = norm(block ?? '');
  if (b) for (const [key, re] of BLOCK_RULES) if (re.test(b)) return key;
  return 'other';
}

export interface ExpenseTaskInput {
  description: string;
  cost: number;
  /** Фактические расходы на сегодня */
  costFact?: number;
  expenseCategory: string | null;
}

/** Направление задачи: выбранное вручную или автоматическое. */
export function taskExpenseCategory(
  t: Pick<ExpenseTaskInput, 'description' | 'expenseCategory'>,
  block: string | null,
): ExpenseCategoryKey {
  return isExpenseCategory(t.expenseCategory)
    ? t.expenseCategory
    : autoExpenseCategory(t.description, block);
}

export interface ExpenseGroup<T> {
  category: ExpenseCategory;
  /** Задачи направления (все, включая без стоимости) */
  tasks: T[];
  /** План */
  total: number;
  /** Факт */
  fact: number;
}

/** Раскладывает задачи по направлениям в порядке EXPENSE_CATEGORIES. */
export function groupExpenses<T extends ExpenseTaskInput>(
  tasks: T[],
  blockOf: (t: T) => string | null,
): { groups: ExpenseGroup<T>[]; total: number; fact: number } {
  const map = new Map<ExpenseCategoryKey, T[]>(EXPENSE_CATEGORIES.map((c) => [c.key, []]));
  for (const t of tasks) map.get(taskExpenseCategory(t, blockOf(t)))!.push(t);
  const groups = EXPENSE_CATEGORIES.map((category) => {
    const list = map.get(category.key)!;
    return {
      category,
      tasks: list,
      total: list.reduce((s, t) => s + t.cost, 0),
      fact: list.reduce((s, t) => s + (t.costFact ?? 0), 0),
    };
  });
  return {
    groups,
    total: groups.reduce((s, g) => s + g.total, 0),
    fact: groups.reduce((s, g) => s + g.fact, 0),
  };
}
