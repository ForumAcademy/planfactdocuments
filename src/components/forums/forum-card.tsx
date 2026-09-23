'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Copy,
  MapPin,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { diffDays, formatDate, type ISODate } from '@/lib/dates';
import { COUNTER_CLASS, progressPercent, type StatusCounts } from '@/lib/status';
import type { ForumDTO } from '@/lib/types';
import { formatAmount, pluralRu } from '@/lib/utils';
import type { ForumMoney } from '@/server/queries';
import { deleteForum, duplicateForum, setForumArchived } from '@/server/actions/forums';
import { ForumFormDialog } from './forum-form-dialog';

export function forumDateRange(f: Pick<ForumDTO, 'startDate' | 'endDate'>): string {
  return f.endDate && f.endDate !== f.startDate
    ? `${formatDate(f.startDate)} – ${formatDate(f.endDate)}`
    : formatDate(f.startDate);
}

export function daysLeftText(f: Pick<ForumDTO, 'startDate' | 'endDate'>, today: ISODate): string {
  const left = diffDays(today, f.startDate);
  const end = f.endDate ?? f.startDate;
  if (left > 0) return `через ${left} ${pluralRu(left, 'день', 'дня', 'дней')}`;
  if (today <= end) return 'идёт сейчас';
  return 'прошёл';
}

export function ForumCard({
  forum,
  counts,
  income,
  expenses,
  today,
  forumOptions,
}: {
  forum: ForumDTO;
  counts: StatusCounts;
  income?: ForumMoney | null;
  expenses?: ForumMoney | null;
  today: ISODate;
  forumOptions: { id: number; name: string }[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editOpen, setEditOpen] = useState(false);
  const c = counts;
  const pct = progressPercent(c);
  const left = daysLeftText(forum, today);

  const onDuplicate = async () => {
    const res = await duplicateForum(forum.id);
    if (res.ok) {
      toast.success('Форум продублирован');
      router.refresh();
    } else toast.error(res.error);
  };
  const onArchive = async () => {
    const res = await setForumArchived(forum.id, !forum.archived);
    if (res.ok) {
      toast.success(forum.archived ? 'Форум возвращён из архива' : 'Форум перенесён в архив');
      router.refresh();
    } else toast.error(res.error);
  };
  const onDelete = async () => {
    const ok = await confirm({
      title: `Удалить форум «${forum.name}»?`,
      description:
        'Будут удалены все задачи, история и отчёт форума. Это действие нельзя отменить. Если форум может понадобиться — лучше перенесите его в архив.',
      confirmText: 'Удалить навсегда',
      danger: true,
    });
    if (!ok) return;
    const res = await deleteForum(forum.id);
    if (res.ok) {
      toast.success('Форум удалён');
      router.refresh();
    } else toast.error(res.error);
  };

  return (
    <Card className="group relative flex flex-col transition-shadow hover:shadow-md">
      <Link
        href={`/forums/${forum.id}/gantt`}
        className="flex flex-1 flex-col p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        data-testid="forum-card"
      >
        <div className="pr-8">
          <h2 className="text-lg font-semibold leading-tight text-ink group-hover:text-brand">
            {forum.name}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/70">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" /> {forumDateRange(forum)}
            </span>
            {forum.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {forum.location}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="text-ink/70">Выполнено</span>
            <span className="font-semibold">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-status-green transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-4 gap-1 text-center">
          <Counter label="Не начато" value={c.notStarted} />
          <Counter label="В работе" value={c.inProgress} className={COUNTER_CLASS.inProgress} />
          <Counter label="Выполнено" value={c.done} className={COUNTER_CLASS.done} />
          <Counter
            label="Просрочено"
            value={c.overdue}
            className={c.overdue ? 'text-status-red' : ''}
          />
        </dl>

        <dl className="mt-2 grid grid-cols-2 gap-1" data-testid="forum-money">
          <Money label="Доходы" value={income} className="text-status-green" />
          <Money label="Расходы" value={expenses} className="text-status-red" />
        </dl>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="text-ink/70">
            {c.total} {pluralRu(c.total, 'задача', 'задачи', 'задач')}
          </span>
          <span className={left === 'прошёл' ? 'text-status-gray' : 'font-medium text-brand-dark'}>
            {left === 'прошёл'
              ? 'Форум прошёл'
              : left === 'идёт сейчас'
                ? 'Форум идёт сейчас'
                : `До форума ${left.replace('через ', '')}`}
          </span>
        </div>
      </Link>

      <div className="absolute right-2 top-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded p-1.5 text-status-gray hover:bg-surface hover:text-ink"
            aria-label="Меню форума"
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil /> Редактировать
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy /> Дублировать
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onArchive}>
              {forum.archived ? <ArchiveRestore /> : <Archive />}
              {forum.archived ? 'Вернуть из архива' : 'Архивировать'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onSelect={onDelete}>
              <Trash2 /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ForumFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        forum={forum}
        forumOptions={forumOptions}
      />
    </Card>
  );
}

function Counter({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="rounded bg-surface px-1 py-1.5">
      <dd className={`text-lg font-semibold tabular-nums leading-none ${className ?? ''}`}>
        {value}
      </dd>
      <dt className="mt-1 text-[11px] leading-tight text-ink/60">{label}</dt>
    </div>
  );
}

function Money({
  label,
  value,
  className,
}: {
  label: string;
  value?: ForumMoney | null;
  className: string;
}) {
  return (
    <div className="rounded bg-surface px-2 py-1.5 text-center">
      <dd
        className={`text-base font-semibold tabular-nums leading-none ${value ? className : 'text-status-gray'}`}
      >
        {value ? formatAmount(value.amount) : '—'}
      </dd>
      <dt className="mt-1 text-[11px] leading-tight text-ink/60">
        {label}
        {value ? `, ${value.unit}` : ''}
      </dt>
    </div>
  );
}
