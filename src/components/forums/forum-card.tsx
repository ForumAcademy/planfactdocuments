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
import { progressPercent, type StatusCounts } from '@/lib/status';
import { FORUM_COLORS, FORUM_COLOR_KEYS, forumColor, type ForumColor } from '@/lib/forum-colors';
import type { ForumDTO } from '@/lib/types';
import { cn, pluralRu } from '@/lib/utils';
import {
  deleteForum,
  duplicateForum,
  setForumArchived,
  setForumColor,
} from '@/server/actions/forums';
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
  today,
  forumOptions,
}: {
  forum: ForumDTO;
  counts: StatusCounts;
  today: ISODate;
  forumOptions: { id: number; name: string }[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editOpen, setEditOpen] = useState(false);
  const c = counts;
  const pct = progressPercent(c);
  const left = daysLeftText(forum, today);

  const onColor = async (k: ForumColor) => {
    const res = await setForumColor(forum.id, k);
    if (res.ok) router.refresh();
    else toast.error(res.error);
  };
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

  const col = forumColor(forum.color);
  const daysLeft = diffDays(today, forum.startDate);
  // Шкала: красная, если есть просроченные задачи; зелёная — всё в срок
  const late = c.overdue > 0;

  return (
    <Card className="group relative flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <Link
        href={`/forums/${forum.id}/gantt`}
        className="flex flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        data-testid="forum-card"
      >
        {/* Шапка в цвете форума */}
        <div className="px-4 pb-3 pt-4 text-white" style={{ background: col.hex }}>
          <h2 className="pr-8 text-lg font-semibold leading-tight">{forum.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/85">
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

        <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
          {/* Сколько дней до форума */}
          <div className="flex items-baseline gap-2" data-testid="forum-days">
            {left === 'прошёл' ? (
              <span className="text-xl font-semibold text-status-gray">Форум прошёл</span>
            ) : left === 'идёт сейчас' ? (
              <span className="text-xl font-semibold" style={{ color: col.hex }}>
                Форум идёт сейчас
              </span>
            ) : (
              <>
                <span
                  className="text-4xl font-bold tabular-nums leading-none"
                  style={{ color: col.hex }}
                >
                  {daysLeft}
                </span>
                <span className="text-sm text-ink/70">
                  {pluralRu(daysLeft, 'день', 'дня', 'дней')} до форума
                </span>
              </>
            )}
          </div>

          {/* Выполнение */}
          <div className="mt-auto pt-4">
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="text-ink/70">Выполнено</span>
              <span className={cn('font-semibold', late ? 'text-status-red' : 'text-status-green')}>
                {pct}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  late ? 'bg-status-red' : 'bg-status-green',
                )}
                style={{ width: `${pct}%` }}
                data-testid="forum-progress"
                data-late={late ? '1' : '0'}
              />
            </div>
          </div>
        </div>
      </Link>

      <div className="absolute right-2 top-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded p-1.5 text-white/80 hover:bg-white/15 hover:text-white"
            aria-label="Меню форума"
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil /> Редактировать
            </DropdownMenuItem>
            <div className="px-2 py-1.5">
              <div className="mb-1 text-xs text-ink/60">Цвет карточки</div>
              <div className="flex gap-1.5">
                {FORUM_COLOR_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    title={FORUM_COLORS[k].label}
                    aria-label={`Цвет: ${FORUM_COLORS[k].label}`}
                    onClick={() => void onColor(k)}
                    className={cn(
                      'size-6 rounded-full ring-offset-2',
                      forum.color === k ? 'ring-2 ring-ink/70' : 'hover:scale-110',
                    )}
                    style={{ background: FORUM_COLORS[k].hex }}
                  />
                ))}
              </div>
            </div>
            <DropdownMenuSeparator />
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
