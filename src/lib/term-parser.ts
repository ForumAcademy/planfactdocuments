import { addDays, addMonths, addWeeks, addWorkdays, type ISODate } from './dates';

/** Опорные даты форума: F — начало, FE — окончание, S — старт продаж. */
export interface TermRefs {
  forumStart: ISODate;
  forumEnd?: ISODate | null;
  salesStart: ISODate;
}

export interface TermResult {
  start: ISODate;
  end: ISODate;
  /** Срок не распознан или распознан приблизительно — нужна пометка «уточнить срок». */
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

  const text = normalizeTerm(rawText ?? '');
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
  m = new RegExp(`за (\\d+)-(\\d+) ${UNIT_RE} до форума`).exec(core);
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
  m = new RegExp(`за (\\d+) ${UNIT_RE} до форума`).exec(core);
  if (m) {
    const end = shift(F, -Number(m[1]), unitOf(m[2]));
    const leftover = rest(m[0]);
    const hasQualifier = Boolean(leftover) || notes.length > 0;
    return result({ start: addDays(end, hasQualifier ? -1 : -7), end }, [leftover]);
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

  // «на протяжении этапа…», «по графику платежей…», «при выборе площадки» и прочее
  const leftover = clean(core.replace(/на (?:всем )?протяжении этапа/, ' '));
  const isStageWide = /на (?:всем )?протяжении этапа/.test(core);
  return fallback(joinNotes(isStageWide ? [leftover, ...notes] : notes));
}
