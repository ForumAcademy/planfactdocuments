'use client';

import Link from 'next/link';
import { TabGroup, TabLink } from '@/components/ui/tab-links';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import * as React from 'react';
import { CalendarDays, ChevronRight, Globe, MapPin, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ForumFormDialog } from '@/components/forums/forum-form-dialog';
import { daysLeftText, forumDateRange } from '@/components/forums/forum-card';
import { formatDate } from '@/lib/dates';
import { COUNTER_CLASS, countStatuses, progressPercent, type TaskStatusCode } from '@/lib/status';
import { cn, pluralRu } from '@/lib/utils';
import { addMissingTemplateTasks } from '@/server/actions/forums';
import { useForum } from './forum-context';
import { PlanImportButton } from './plan-import-dialog';
import { PlanExportButton } from './plan-export-dialog';
import { StatusLines } from './status-lines';

/** Подразделы вкладки «План» (страницы /tasks и /gantt) */
const PLAN_SECTIONS = [
  { key: 'gantt', label: 'Диаграмма Ганта', short: 'Гант' },
  { key: 'tasks', label: 'Этапы и задачи', short: 'Задачи' },
] as const;

type SubSection = { key: string; label: string; short: string };

/** Вкладки форума; `href` — страница, на которую ведёт вкладка */
const SECTIONS: {
  key: string;
  href: string;
  label: string;
  short: string;
  sub?: readonly SubSection[];
}[] = [
  { key: 'plan', href: 'gantt', label: 'План', short: 'План', sub: PLAN_SECTIONS },
  { key: 'expenses', href: 'expenses', label: 'Расходы', short: 'Расходы' },
  { key: 'income', href: 'income', label: 'Доходы', short: 'Доходы' },
  { key: 'funnel', href: 'funnel', label: 'Воронка продаж', short: 'Воронка' },
  { key: 'report', href: 'report', label: 'Отчёт', short: 'Отчёт' },
];

function activeSection(pathname: string) {
  return SECTIONS.find((s) =>
    s.sub ? s.sub.some((x) => pathname.endsWith(`/${x.key}`)) : pathname.endsWith(`/${s.href}`),
  );
}

/** Вкладки, где работают фильтры задач (счётчики статусов, query-параметры) */
const TASK_SECTIONS = ['gantt', 'tasks'];

export function ForumBreadcrumbs() {
  const { forum } = useForum();
  const pathname = usePathname();
  const section = activeSection(pathname);
  const sub = section?.sub?.find((x) => pathname.endsWith(`/${x.key}`));
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
        {sub && (
          <li className="flex items-center gap-1">
            <ChevronRight className="size-3.5 text-status-gray" />
            <span>{sub.label}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}

export function ForumHeader({
  forumOptions,
  templateGap,
  income,
}: {
  forumOptions: { id: number; name: string }[];
  /** Данные доходов для линии доходов */
  income: React.ComponentProps<typeof StatusLines>['income'];
  /** Сколько задач мастер-плана не хватает форуму (форум создан до дозаполнения шаблона) */
  templateGap: { missing: number; total: number } | null;
}) {
  const { forum, tasks, today, filters, setFilters, saving } = useForum();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [editOpen, setEditOpen] = React.useState(false);
  const c = countStatuses(tasks, today);
  const current = activeSection(pathname);

  const toggleStatus = (s: TaskStatusCode) => {
    const on = filters.status.length === 1 && filters.status[0] === s;
    setFilters({ status: on ? [] : [s], due: null });
  };
  const toggleOverdue = () =>
    setFilters({ due: filters.due === 'overdue' ? null : 'overdue', status: [] });

  // Переход между вкладками сохраняет фильтры
  const qs = sp.toString();
  const href = (key: string) =>
    TASK_SECTIONS.includes(key) && qs
      ? `/forums/${forum.id}/${key}?${qs}`
      : `/forums/${forum.id}/${key}`;

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
      title={`Показать задачи: ${label.toLowerCase()}`}
      className={cn(
        'flex min-w-[92px] flex-col items-start rounded-md border px-3 py-1.5 text-left transition-colors',
        active ? 'border-brand bg-brand-light' : 'border-line bg-white hover:border-brand/50',
      )}
    >
      <span className={cn('text-lg font-semibold tabular-nums leading-tight', cls)}>{value}</span>
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
              {forum.website && (
                <a
                  href={forum.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                  data-testid="forum-website"
                >
                  <Globe className="size-3.5" /> {siteLabel(forum.website)}
                </a>
              )}
            </div>
          </div>
        </div>
        <StatusLines income={income} />
        <TabGroup className="thin-scroll mt-3 flex gap-1 overflow-x-auto" role="tablist">
          {SECTIONS.map((s) => (
            <TabLink
              key={s.key}
              href={href(s.href)}
              role="tab"
              active={current?.key === s.key}
              className="-mb-px inline-flex flex-1 items-center justify-center whitespace-nowrap border-b-2 px-2 py-2 text-sm sm:flex-none sm:px-4"
              activeClassName="border-brand font-medium text-brand"
              inactiveClassName="border-transparent text-ink/70 hover:text-ink"
            >
              <span className="sm:hidden">{s.short}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </TabLink>
          ))}
        </TabGroup>
        {current?.sub && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
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
            {templateGap && <TemplateGapNote gap={templateGap} />}
          </div>
        )}
        {current?.sub && (
          <div className="mb-3 mt-3 flex flex-wrap items-center gap-2">
            <TabGroup
              className="inline-flex rounded-lg border border-line bg-surface p-0.5"
              role="tablist"
              aria-label={current.label}
              data-testid="plan-subtabs"
            >
              {current.sub.map((x) => (
                <TabLink
                  key={x.key}
                  href={href(x.key)}
                  role="tab"
                  active={pathname.endsWith(`/${x.key}`)}
                  className="inline-flex items-center rounded-md px-4 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  activeClassName="bg-white font-medium text-brand shadow-sm"
                  inactiveClassName="text-ink/70 hover:text-ink"
                >
                  <span className="sm:hidden">{x.short}</span>
                  <span className="hidden sm:inline">{x.label}</span>
                </TabLink>
              ))}
            </TabGroup>
            <div className="ml-auto flex flex-wrap gap-2">
              <PlanImportButton />
              <PlanExportButton />
            </div>
          </div>
        )}
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

/** «https://www.forum.ru/» → «forum.ru» */
function siteLabel(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

/** Форум создан, когда в базе было не всё мастер-плана: можно дописать недостающие задачи */
function TemplateGapNote({ gap }: { gap: { missing: number; total: number } }) {
  const { forum, tasks } = useForum();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const add = async () => {
    setBusy(true);
    const res = await addMissingTemplateTasks(forum.id);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Добавлено задач из мастер-плана: ${res.data}`);
    router.refresh();
  };
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm"
      data-testid="template-gap"
    >
      <span>
        В форуме {tasks.length} {pluralRu(tasks.length, 'задача', 'задачи', 'задач')}, в
        мастер-плане {gap.total}
      </span>
      <Button size="sm" variant="outline" onClick={() => void add()} disabled={busy}>
        {busy ? 'Добавляем…' : `Добавить недостающие ${gap.missing}`}
      </Button>
    </div>
  );
}
