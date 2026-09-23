import type { ISODate } from './dates';
import type { TaskStatusCode } from './status';

export interface ForumDTO {
  id: number;
  name: string;
  startDate: ISODate;
  endDate: ISODate | null;
  salesStartDate: ISODate;
  location: string | null;
  archived: boolean;
  reportDate: ISODate | null;
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
  status: TaskStatusCode;
  completedAt: ISODate | null;
  comment: string | null;
  order: number;
  roleIds: number[];
  employeeIds: number[];
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

export interface DictsDTO {
  stages: StageDTO[];
  blocks: NamedDTO[];
  roles: NamedDTO[];
  employees: EmployeeDTO[];
}

export interface HistoryDTO {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: string;
}
