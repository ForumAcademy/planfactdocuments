'use client';

import Link from 'next/link';
import * as React from 'react';
import { Bell as BellIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate } from '@/lib/dates';
import { cn } from '@/lib/utils';

export interface BellItem {
  kind: 'overdue' | 'due_soon' | 'should_start';
  taskId: number;
  number: number;
  description: string;
  endDate: string | null;
  lag: number;
  forumId: number;
  forumName: string;
  employees: string;
}

const LABEL = {
  overdue: 'Просрочено',
  due_soon: 'Скоро срок',
  should_start: 'Пора начинать',
} as const;
const COLOR = {
  overdue: 'text-status-red',
  due_soon: 'text-brand',
  should_start: 'text-status-red',
} as const;

export function Bell({
  items,
  total,
  daysBefore,
}: {
  items: BellItem[];
  total: number;
  daysBefore: number;
}) {
  const [tab, setTab] = React.useState<BellItem['kind'] | 'all'>('all');
  const counts = {
    overdue: items.filter((i) => i.kind === 'overdue').length,
    due_soon: items.filter((i) => i.kind === 'due_soon').length,
    should_start: items.filter((i) => i.kind === 'should_start').length,
  };
  const list = tab === 'all' ? items : items.filter((i) => i.kind === tab);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-white/90 hover:bg-white/10"
          aria-label={`Уведомления: ${total}`}
          data-testid="bell"
        >
          <BellIcon className="size-5" />
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-status-red px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
              {total > 99 ? '99+' : total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(420px,calc(100vw-16px))] p-0">
        <div className="border-b border-line px-3 py-2">
          <div className="font-semibold">Уведомления</div>
          <div className="text-xs text-ink/60">
            Просроченные задачи, срок в ближайшие {daysBefore} дн. и задачи, которые пора начинать
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            {(['all', 'overdue', 'due_soon', 'should_start'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  'rounded px-2 py-1',
                  tab === k ? 'bg-brand text-white' : 'bg-surface hover:bg-line',
                )}
              >
                {k === 'all' ? `Все (${items.length})` : `${LABEL[k]} (${counts[k]})`}
              </button>
            ))}
          </div>
        </div>
        <ul className="thin-scroll max-h-[60vh] overflow-y-auto">
          {list.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-status-gray">
              Всё в порядке — уведомлений нет
            </li>
          )}
          {list.map((i) => (
            <li key={`${i.kind}-${i.taskId}`} className="border-b border-line last:border-0">
              <Link
                href={`/forums/${i.forumId}/tasks?q=${encodeURIComponent(i.description.slice(0, 40))}`}
                className="block px-3 py-2 hover:bg-surface"
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={cn('font-semibold', COLOR[i.kind])}>
                    {LABEL[i.kind]}
                    {i.lag > 0 ? ` +${i.lag} дн.` : ''}
                  </span>
                  <span className="text-ink/60">{i.forumName}</span>
                  <span className="ml-auto text-ink/60">срок {formatDate(i.endDate)}</span>
                </div>
                <div className="mt-0.5 line-clamp-2 text-sm">
                  №{i.number}. {i.description}
                </div>
                {i.employees && <div className="text-xs text-ink/60">{i.employees}</div>}
              </Link>
            </li>
          ))}
        </ul>
        {total > items.length && (
          <div className="border-t border-line px-3 py-2 text-xs text-ink/60">
            Показаны первые {items.length} из {total}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
