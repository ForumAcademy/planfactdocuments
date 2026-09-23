import type { ISODate } from './dates';
import { parseTerm, stageNumberFromName, type TermRefs } from './term-parser';

export interface ForumRefs {
  startDate: ISODate;
  endDate: ISODate | null;
  salesStartDate: ISODate;
}

export function toTermRefs(f: ForumRefs): TermRefs {
  return { forumStart: f.startDate, forumEnd: f.endDate, salesStart: f.salesStartDate };
}

/** Номер этапа: из названия («2. …»), иначе порядковый номер из справочника. */
export function stageNumber(
  stage: { name: string; order: number } | null | undefined,
): number | null {
  if (!stage) return null;
  return stageNumberFromName(stage.name) ?? (stage.order > 0 ? stage.order : null);
}

export interface ComputedDates {
  startDate: ISODate;
  endDate: ISODate;
  needsClarification: boolean;
  note: string | null;
}

export function computeTaskDates(
  termText: string,
  stage: { name: string; order: number } | null | undefined,
  forum: ForumRefs,
): ComputedDates {
  const r = parseTerm(termText, toTermRefs(forum), stageNumber(stage));
  return {
    startDate: r.start,
    endDate: r.end,
    needsClarification: r.needsClarification,
    note: r.note,
  };
}

/** Добавляет уточнение срока в комментарий (если его там ещё нет). */
export function mergeNoteIntoComment(
  comment: string | null | undefined,
  note: string | null,
): string | null {
  const c = (comment ?? '').trim();
  if (!note) return c || null;
  const line = `Срок: ${note}`;
  if (c.includes(note)) return c;
  return c ? `${c}\n${line}` : line;
}

export const STAGE_COLORS = ['#1F4E9E', '#2E7DD1', '#0F2A5C', '#5B8DEF', '#7A5AF8', '#0E9384'];
