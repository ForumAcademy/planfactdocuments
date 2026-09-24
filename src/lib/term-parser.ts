import { addDays, addMonths, addWeeks, addWorkdays, maxDate, type ISODate } from './dates';

/** Опорные даты форума: F — начало, FE — окончание, S — старт продаж. */
export interface TermRefs {
  forumStart: ISODate;
  forumEnd?: ISODate | null;
  salesStart: ISODate;
}

export interface TermResult {
  start: ISODate;
  end: ISODate;
  /** Срок не распознан — пометка «примерный срок», даты по границам этапа. */
  needsClarification: boolean;
  /** Контрольная точка (веха): начало = окончание. */
  milestone: boolean;
  /** Уточнение из текста срока (после запятой, в скобках, после «;») — уходит в комментарий. */
  note: string | null;
}

export interface Bounds {
  start: ISODate;
  end: ISODate;
}

function refsOf(refs: TermRefs) {
  const F = refs.forumStart;
  const FE = refs.forumEnd && refs.forumEnd >= F ? refs.forumEnd : F;
  const S = refs.salesStart;
  return { F, FE, S };
}

/**
 * Границы этапов по умолчанию:
 * 1 — S−60 … S; 2 — S … F−1; 3 — F … FE; 4 — FE+1 … FE+30.
 * Для неизвестного этапа — весь период подготовки.
 */
export function stageBounds(stageNumber: number | null | undefined, refs: TermRefs): Bounds {
  const { F, FE, S } = refsOf(refs);
  switch (stageNumber) {
    case 1:
      return { start: addDays(S, -60), end: S };
    case 2:
      return { start: S, end: addDays(F, -1) };
    case 3:
      return { start: F, end: FE };
    case 4:
      return { start: addDays(FE, 1), end: addDays(FE, 30) };
    default:
      return { start: addDays(S, -60), end: addDays(FE, 30) };
  }
}

/** «2. Продажи и орг. подготовка» → 2 */
export function stageNumberFromName(name: string | null | undefined): number | null {
  if (!name) return null;
  const m = /^\s*(\d+)/.exec(name);
  return m ? Number(m[1]) : null;
}

/** Нормализация текста срока: регистр, пробелы, тире в диапазонах, «ё». */
export function normalizeTerm(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[ \s]+/g, ' ')
    .replace(/(\d)\s*[–—−-]\s*(\d)/g, '$1-$2')
    .trim();
}

type Unit = 'day' | 'week' | 'month';

const UNIT_RE = '(дн[а-я]*|день|недел[а-я]*|месяц[а-я]*|мес\\.?)';

function unitOf(word: string): Unit {
  if (word.startsWith('недел')) return 'week';
  if (word.startsWith('мес')) return 'month';
  return 'day';
}

function shift(d: ISODate, n: number, unit: Unit): ISODate {
  if (unit === 'week') return addWeeks(d, n);
  if (unit === 'month') return addMonths(d, n);
  return addDays(d, n);
}

const TRIM_RE = /^[\s,;:.()\/—–-]+|[\s,;:.()\/—–-]+$/g;

function clean(s: string): string {
  return s.replace(TRIM_RE, '').replace(/\s+/g, ' ').trim();
}

/** Отделяет уточнения: содержимое скобок и всё после «;». */
function splitQualifiers(text: string): { core: string; notes: string[] } {
  const notes: string[] = [];
  let core = text.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    const c = clean(inner);
    if (c) notes.push(c);
    return ' ';
  });
  const semi = core.split(';');
  core = semi[0];
  for (const rest of semi.slice(1)) {
    const c = clean(rest);
    if (c) notes.push(c);
  }
  return { core: core.replace(/\s+/g, ' ').trim(), notes };
}

function joinNotes(notes: string[]): string | null {
  const n = notes.map(clean).filter(Boolean);
  return n.length ? n.join('; ') : null;
}

function ordered(start: ISODate, end: ISODate): Bounds {
  return start <= end ? { start, end } : { start: end, end };
}

/**
 * Переводит текстовый срок из мастер-плана в даты начала и окончания.
 * Правила — см. README («Правила перевода текстового срока в даты»).
 */
export function parseTerm(
  rawText: string | null | undefined,
  refs: TermRefs,
  stageNumber: number | null | undefined,
): TermResult {
  const { F, FE, S } = refsOf(refs);
  const bounds = stageBounds(stageNumber, refs);
  const fallback = (note: string | null): TermResult => ({
    ...bounds,
    needsClarification: true,
    milestone: false,
    note,
  });

  const text = expandTerm(normalizeTerm(rawText ?? ''));
  if (!text) return fallback(null);

  const { core, notes } = splitQualifiers(text);
  const rest = (matched: string) => clean(core.replace(matched, ' '));
  const result = (b: Bounds, extraNotes: string[] = [], milestone = false): TermResult => ({
    ...ordered(b.start, b.end),
    needsClarification: false,
    milestone,
    note: joinNotes([...extraNotes, ...notes]),
  });

  let m: RegExpExecArray | null;

  // Монтаж: «в день монтажа», «период монтажа, за 1 день до форума»
  if (/монтаж/.test(core)) {
    const d = addDays(F, -1);
    return result({ start: d, end: d });
  }

  // Контрольная точка: «контрольная точка, за 4 месяца»
  if (/контрольн[а-я]* точк/.test(core)) {
    m = new RegExp(`за (\\d+) ${UNIT_RE}`).exec(core);
    if (m) {
      const d = shift(F, -Number(m[1]), unitOf(m[2]));
      return result({ start: d, end: d }, [], true);
    }
    return fallback(joinNotes(notes));
  }

  // «в день окончания форума / на следующий день»
  if (/в день окончания форума/.test(core)) {
    const end = /следующ[а-я]* день/.test(core) ? addDays(FE, 1) : FE;
    return result({ start: FE, end });
  }

  // «в течение N рабочих дней после форума»
  m = /в течение (\d+) рабоч[а-я]* (?:дн[а-я]*|день) после форума/.exec(core);
  if (m) {
    return result({ start: addDays(FE, 1), end: addWorkdays(FE, Number(m[1])) }, [rest(m[0])]);
  }

  // «в течение N дней/недель после форума»
  m = new RegExp(`в течение (\\d+) ${UNIT_RE} после форума`).exec(core);
  if (m) {
    return result({ start: addDays(FE, 1), end: shift(FE, Number(m[1]), unitOf(m[2])) }, [
      rest(m[0]),
    ]);
  }

  // «на следующий день после форума»
  m = /на следующ[а-я]* день после форума/.exec(core);
  if (m) {
    const d = addDays(FE, 1);
    return result({ start: d, end: d }, [rest(m[0])]);
  }

  // «в дни форума», «в день форума»
  m = /в (?:дни|день|дату) (?:проведения )?форума/.exec(core);
  if (m) {
    return result({ start: F, end: FE }, [rest(m[0])]);
  }

  // Диапазон: «за 8-9 недель до форума»
  m = new RegExp(`(?:за )?(\\d+)-(\\d+) ${UNIT_RE} до форума`).exec(core);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const unit = unitOf(m[3]);
    return result(
      { start: shift(F, -Math.max(a, b), unit), end: shift(F, -Math.min(a, b), unit) },
      [rest(m[0])],
    );
  }

  // «на протяжении этапа, не позднее 2 недель до форума»
  m = new RegExp(`не позднее (\\d+) ${UNIT_RE} до форума`).exec(core);
  if (m) {
    const end = shift(F, -Number(m[1]), unitOf(m[2]));
    return result({ start: bounds.start, end }, [
      rest(m[0]).replace(/на (?:всем )?протяжении этапа/, ''),
    ]);
  }

  // «за N дней / недель / месяцев до форума» (+ уточнения)
  m = new RegExp(`(?:за )?(\\d+) ${UNIT_RE} до форума`).exec(core);
  if (m) {
    const end = shift(F, -Number(m[1]), unitOf(m[2]));
    const leftover = rest(m[0]);
    const hasQualifier = Boolean(leftover) || notes.length > 0;
    return result({ start: addDays(end, hasQualifier ? -1 : -7), end }, [leftover]);
  }

  // Конкретные даты: «до 15.10.2026», «01.10.2026», «с 01.10 по 15.10», «01.10.2026-15.10.2026»
  const dates = explicitDates(core, refs);
  if (dates.length >= 2) {
    return result({ start: dates[0].date, end: dates[1].date }, [
      rest(dates[0].raw)
        .replace(dates[1].raw, '')
        .replace(/^(?:с|от)\s+|\s*(?:по|до|-)\s*$/g, ''),
    ]);
  }
  if (dates.length === 1) {
    const d = dates[0].date;
    const leftover = clean(rest(dates[0].raw).replace(/^(?:до|к|не позднее|срок)\s*$/, ''));
    if (/(?:^|\s)(?:с|начиная с)\s*$/.test(core.slice(0, core.indexOf(dates[0].raw)))) {
      return result({ start: d, end: maxDate(d, bounds.end) }, []);
    }
    return result({ start: addDays(d, -7), end: d }, [leftover]);
  }

  // «за N дней/недель/месяцев до старта продаж», «за 2-3 недели до старта продаж»
  m = new RegExp(`(?:за )?(\\d+)(?:-(\\d+))? ${UNIT_RE} до (?:старта|начала) продаж`).exec(core);
  if (m) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    const unit = unitOf(m[3]);
    const end = shift(S, -Math.min(a, b), unit);
    const start = a !== b ? shift(S, -Math.max(a, b), unit) : addDays(end, -7);
    return result({ start, end }, [rest(m[0])]);
  }

  // «в течение N … после старта продаж», «через N … после старта продаж»
  m = new RegExp(
    `(в течение|через) (\\d+) ${UNIT_RE} (?:после|с|от) (?:старта|начала) продаж`,
  ).exec(core);
  if (m) {
    const d = shift(S, Number(m[2]), unitOf(m[3]));
    return result(m[1] === 'через' ? { start: d, end: d } : { start: S, end: d }, [rest(m[0])]);
  }

  // «через N … после форума», «N … после форума»
  m = new RegExp(`(?:через )?(\\d+) ${UNIT_RE} после форума`).exec(core);
  if (m) {
    const d = shift(FE, Number(m[1]), unitOf(m[2]));
    return result({ start: addDays(FE, 1), end: d }, [rest(m[0])]);
  }

  // «накануне форума»
  m = /накануне форума/.exec(core);
  if (m) {
    const d = addDays(F, -1);
    return result({ start: d, end: d }, [rest(m[0])]);
  }

  // «после форума» (без срока) — неделя после окончания
  m = /^после форума$|по итогам форума|после окончания форума/.exec(core);
  if (m) {
    return result({ start: addDays(FE, 1), end: addDays(FE, 7) }, [rest(m[0])]);
  }

  // «до форума» (без срока) — от начала этапа до дня перед форумом
  m = /^до (?:начала )?форума$/.exec(core);
  if (m) {
    return result({ start: bounds.start, end: maxDate(bounds.start, addDays(F, -1)) });
  }

  // «до старта продаж»
  m = /до (?:старта|начала) продаж/.exec(core);
  if (m) {
    return result({ start: stageBounds(1, refs).start, end: S }, [rest(m[0])]);
  }

  // «с начала продаж», «с начала продаж, далее на регулярной основе»
  m = /с (?:начала|старта) продаж/.exec(core);
  if (m) {
    return result({ start: S, end: addDays(F, -1) }, [rest(m[0])]);
  }

  // «на протяжении этапа…», «в течение этапа» — весь этап (срок понятен, даты точные)
  m = /на (?:всем )?протяжении (?:всего )?этапа|в течение (?:всего )?этапа|весь этап/.exec(core);
  if (m) {
    return result(bounds, [rest(m[0])]);
  }

  // «по графику платежей…», «при выборе площадки» и прочее — срок примерный
  return fallback(joinNotes(notes));
}

const NUM_WORDS: Record<string, number> = {
  один: 1,
  одну: 1,
  одна: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
};

/**
 * Приводит свободные формулировки к виду, который понимает разбор:
 * «за неделю» → «за 1 неделю», «за две недели» → «за 2 недели», «полтора месяца» → «6 недель»,
 * «1,5 месяца» → «45 дней», «мероприятия» → «форума».
 */
export function expandTerm(text: string): string {
  return text
    .replace(/мероприяти[а-я]*|событи[а-я]*|конференци[а-я]*/g, 'форума')
    .replace(/(до|после) (?:начала|даты|дня) (?:проведения )?форума/g, '$1 форума')
    .replace(/полтора месяца/g, '6 недель')
    .replace(/полгода/g, '6 месяцев')
    .replace(/пол ?месяца/g, '2 недели')
    .replace(new RegExp(`(?<![а-я])(${Object.keys(NUM_WORDS).join('|')})(?= ${UNIT_RE})`, 'g'), (w) =>
      String(NUM_WORDS[w]),
    )
    .replace(
      /(\d+)[.,](\d+) (месяц[а-я]*|мес\.?)/g,
      (_, a: string, b: string) => `${Math.round(Number(`${a}.${b}`) * 30)} дней`,
    )
    .replace(
      /(\d+)[.,](\d+) (недел[а-я]*)/g,
      (_, a: string, b: string) => `${Math.round(Number(`${a}.${b}`) * 7)} дней`,
    )
    .replace(/(за|через|в течение) (день|дня|неделю|недели|месяц|месяца)(?=\s|$|,)/g, '$1 1 $2');
}

/**
 * Даты, записанные числами: 15.10.2026, 15.10.26, 15.10 (год — ближайший к форуму).
 * Возвращает найденные даты по порядку вместе с исходным текстом.
 */
function explicitDates(core: string, refs: TermRefs): { raw: string; date: ISODate }[] {
  const out: { raw: string; date: ISODate }[] = [];
  const re = /(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(core))) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) continue;
    let year: number;
    if (m[3]) year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    else {
      // Без года — тот год, при котором дата ближе всего к периоду подготовки
      const fy = Number(refs.forumStart.slice(0, 4));
      const cands = [fy - 1, fy, fy + 1].map(
        (y) => `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
      );
      const mid = refs.salesStart;
      cands.sort(
        (a, b) =>
          Math.abs(Date.parse(a) - Date.parse(mid)) - Math.abs(Date.parse(b) - Date.parse(mid)),
      );
      year = Number(cands[0].slice(0, 4));
    }
    const iso = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    const check = new Date(`${iso}T00:00:00Z`);
    if (check.getUTCDate() !== dd) continue;
    out.push({ raw: m[0], date: iso });
  }
  return out;
}
