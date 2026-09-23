'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { CalendarDays, ChevronRight, MapPin, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ForumFormDialog } from '@/components/forums/forum-form-dialog';
import { daysLeftText, forumDateRange } from '@/components/forums/forum-card';
import { formatDate } from '@/lib/dates';
import { COUNTER_CLASS, countStatuses, progressPercent, type TaskStatusCode } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useForum } from './forum-context';
import { PlanImportButton } from './plan-import-dialog';
import { PlanExportButton } from './plan-export-dialog';

const SECTIONS = [
  { key: 'gantt', label: 'Диаграмма Ганта' },
  { key: 'tasks', label: 'Этапы и задачи' },
  { key: 'report', label: 'Отчёт' },
] as const;

export function ForumBreadcrumbs() {
  const { forum } = useForum();
  const pathname = usePathname();
  const section = SECTIONS.find((s) => pathname.endsWith(`/${s.key}`));
  return (
    <nav aria-label="Хлебные крошки" className="border-b border-line bg-surface print:hidden">
      <ol className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-1 px-4 py-2 text-sm">
        <li>
          <Link href="/" className="text-brand hover:underline">
            Форумы
          </Link>
        </li>
        <li className="flex items-center gap-1">
          <ChevronRight className="size-3.5 text-status-gray" />
          <Link href={`/forums/${forum.id}/gantt`} className="text-brand hover:underline">
            {forum.name}
          </Link>
        </li>
        {section && (
          <li className="flex items-center gap-1">
            <ChevronRight className="size-3.5 text-status-gray" />
            <span>{section.label}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}

export function ForumHeader({ forumOptions }: { forumOptions: { id: number; name: string }[] }) {
  const { forum, tasks, today, filters, setFilters, saving } = useForum();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [editOpen, setEditOpen] = React.useState(false);
  const c = countStatuses(tasks, today);
  const onReport = pathname.endsWith('/report');

  const toggleStatus = (s: TaskStatusCode) => {
    const on = filters.status.length === 1 && filters.status[0] === s;
    setFilters({ status: on ? [] : [s], due: null });
  };
  const toggleOverdue = () =>
    setFilters({ due: filters.due === 'overdue' ? null : 'overdue', status: [] });

  // Переход между вкладками сохраняет фильтры
  const qs = sp.toString();
  const href = (key: string) =>
    key !== 'report' && qs ? `/forums/${forum.id}/${key}?${qs}` : `/forums/${forum.id}/${key}`;

  const counter = (
    label: string,
    value: number,
    active: boolean,
    onClick: () => void,
    cls: string,
  ) => (
    <button
      type="button"
      onClick={onClick}
      disabled={onReport}
      title={onReport ? undefined : `Показать задачи: ${label.toLowerCase()}`}
      className={cn(
        'flex min-w-[92px] flex-col items-start rounded-md border px-3 py-1.5 text-left transition-colors disabled:cursor-default',
        active ? 'border-brand bg-brand-light' : 'border-line bg-white hover:border-brand/50',
      )}
    >
      <span className={cn('text-lg font-semibold leading-tight', cls)}>{value}</span>
      <span className="text-[11px] text-ink/60">{label}</span>
    </button>
  );

  return (
    <div className="border-b border-line bg-white">
      <div className="mx-auto max-w-[1600px] px-4 pt-4">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold">{forum.name}</h1>
              <Button
                variant="ghost"
                size="iconSm"
                title="Редактировать форум"
                onClick={() => setEditOpen(true)}
              >
                <Pencil />
              </Button>
              {saving && <Spinner className="text-xs" label="Сохраняем…" />}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink/70">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" /> {forumDateRange(forum)} (
                {daysLeftText(forum, today)})
              </span>
              <span>Старт продаж: {formatDate(forum.salesStartDate)}</span>
              {forum.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" /> {forum.location}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2" data-testid="status-counters">
            {counter(
              'Не начато',
              c.notStarted,
              filters.status.join() === 'NOT_STARTED',
              () => toggleStatus('NOT_STARTED'),
              'text-ink',
            )}
            {counter(
              'В работе',
              c.inProgress,
              filters.status.join() === 'IN_PROGRESS',
              () => toggleStatus('IN_PROGRESS'),
              COUNTER_CLASS.inProgress,
            )}
            {counter(
              'Выполнено',
              c.done,
              filters.status.join() === 'DONE',
              () => toggleStatus('DONE'),
              COUNTER_CLASS.done,
            )}
            {counter(
              'Просрочено',
              c.overdue,
              filters.due === 'overdue',
              toggleOverdue,
              c.overdue ? COUNTER_CLASS.overdue : 'text-ink',
            )}
            <div className="ml-1 hidden flex-col items-start sm:flex">
              <span className="text-lg font-semibold leading-tight">{progressPercent(c)}%</span>
              <span className="text-[11px] text-ink/60">готовность</span>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <PlanImportButton />
            <PlanExportButton />
          </div>
        </div>
        <nav className="thin-scroll mt-3 flex gap-1 overflow-x-auto" role="tablist">
          {SECTIONS.map((s) => {
            const active = pathname.endsWith(`/${s.key}`);
            return (
              <Link
                key={s.key}
                href={href(s.key)}
                role="tab"
                aria-selected={active}
                className={cn(
                  '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm',
                  active
                    ? 'border-brand font-medium text-brand'
                    : 'border-transparent text-ink/70 hover:text-ink',
                )}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <ForumFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        forum={forum}
        forumOptions={forumOptions}
      />
    </div>
  );
}
