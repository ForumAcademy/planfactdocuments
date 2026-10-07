import type { ISODate } from './dates';
import type { CalendarDayDTO } from './work-calendar';
import type { TaskStatusCode } from './status';

export interface ForumDTO {
  id: number;
  name: string;
  startDate: ISODate;
  endDate: ISODate | null;
  salesStartDate: ISODate;
  location: string | null;
  website: string | null;
  /** Цвет карточки (см. lib/forum-colors) */
  color: string;
  /** Предельно допустимые расходы, руб.; null — не задан */
  expenseLimit: number | null;
  archived: boolean;
  reportDate: ISODate | null;
  /** «Отчёт для АЭ»: порядок статей в диаграмме */
  aeReportSort: 'desc' | 'asc';
}

export interface TaskDTO {
  id: number;
  number: number;
  stageId: number | null;
  blockId: number | null;
  description: string;
  termText: string;
  startDate: ISODate | null;
  endDate: ISODate | null;
  needsClarification: boolean;
  datesManual: boolean;
  /** Ответственные изменены вручную (иначе — назначаются по ролям) */
  employeesManual: boolean;
  status: TaskStatusCode;
  completedAt: ISODate | null;
  comment: string | null;
  order: number;
  roleIds: number[];
  employeeIds: number[];
  /** Стоимость, руб. */
  cost: number;
  /** Фактические расходы на сегодня, руб. */
  costFact: number;
  /** Направление расходов (см. lib/expenses); null — автоматически */
  expenseCategory: string | null;
}

export interface StageDTO {
  id: number;
  name: string;
  order: number;
  color: string;
  archived: boolean;
}

export interface NamedDTO {
  id: number;
  name: string;
  order: number;
  archived: boolean;
}

export interface EmployeeDTO {
  id: number;
  fullName: string;
  position: string | null;
  telegram: string | null;
  /** Сотрудник нажал /start у бота */
  telegramLinked: boolean;
  active: boolean;
  roleIds: number[];
}

export interface TermPhraseDTO {
  id: number;
  text: string;
  order: number;
  archived: boolean;
}

export interface DictsDTO {
  stages: StageDTO[];
  blocks: NamedDTO[];
  roles: NamedDTO[];
  employees: EmployeeDTO[];
  /** Формулировки срока — подсказки в поле «Срок» */
  terms: TermPhraseDTO[];
  /** Производственный календарь: праздники, переносы, сокращённые дни */
  calendar: CalendarDayDTO[];
}

export interface HistoryDTO {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: string;
}
