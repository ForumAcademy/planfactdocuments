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

const SEEN_KEY = 'bell-seen-v1';

const itemKey = (i: BellItem) => `${i.kind}:${i.taskId}`;

/** Просмотренные уведомления хранятся в браузере — у каждого пользователя свои. */
function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(keys: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...keys]));
  } catch {
    /* хранилище недоступно — просто не запоминаем */
  }
}

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
  // null — ещё не прочитали хранилище (на сервере и до монтирования)
  const [seen, setSeen] = React.useState<Set<string> | null>(null);
  // Что было новым в момент открытия — подсвечиваем в списке
  const [fresh, setFresh] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const stored = loadSeen();
    // Храним только актуальные уведомления, чтобы список не разрастался
    const actual = new Set(items.map(itemKey));
    const pruned = new Set([...stored].filter((k) => actual.has(k)));
    if (pruned.size !== stored.size) saveSeen(pruned);
    setSeen(pruned);
  }, [items]);

  const unseen = seen === null ? 0 : items.filter((i) => !seen.has(itemKey(i))).length;

  const onOpenChange = (open: boolean) => {
    if (!open || seen === null) return;
    // Открыли список — всё в нём считается просмотренным
    setFresh(new Set(items.filter((i) => !seen.has(itemKey(i))).map(itemKey)));
    const next = new Set(items.map(itemKey));
    saveSeen(next);
    setSeen(next);
  };
  const counts = {
    overdue: items.filter((i) => i.kind === 'overdue').length,
    due_soon: items.filter((i) => i.kind === 'due_soon').length,
    should_start: items.filter((i) => i.kind === 'should_start').length,
  };
  const list = tab === 'all' ? items : items.filter((i) => i.kind === tab);
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-white/90 hover:bg-white/10"
          aria-label={unseen ? `Уведомления: новых ${unseen}` : `Уведомления: ${total}`}
          data-testid="bell"
        >
          <BellIcon className="size-5" />
          {unseen > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-status-red px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
              {unseen > 99 ? '99+' : unseen}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(420px,calc(100vw-16px))] p-0">
        <div className="border-b border-line px-3 py-2">
          <div className="font-semibold">Уведомления</div>
          <div className="text-xs text-ink/60">
            Просроченные задачи, срок в ближайшие {daysBefore} дн. и задачи, которые пора начинать.
            Новые с момента прошлого просмотра отмечены точкой.
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
                  {fresh.has(itemKey(i)) && (
                    <span
                      className="size-2 shrink-0 rounded-full bg-brand"
                      title="Новое"
                      aria-label="Новое"
                    />
                  )}
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
