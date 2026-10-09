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
  /** Появилось сегодня — только такие показываем по умолчанию */
  today: boolean;
}

const COLOR = {
  overdue: 'text-status-red',
  due_soon: 'text-brand',
  should_start: 'text-status-red',
} as const;
/** Заголовки разделов списка */
const SECTION = {
  overdue: { today: 'Срок прошёл вчера', all: 'Просрочено' },
  due_soon: { today: 'Срок сегодня или подходит', all: 'Скоро срок' },
  should_start: { today: 'Пора начинать с сегодня', all: 'Пора начинать' },
} as const;
const KINDS = ['overdue', 'due_soon', 'should_start'] as const;

/** Уведомления раздела, сгруппированные по форумам (по алфавиту), порядок внутри сохраняется */
function byForum(items: BellItem[]) {
  const map = new Map<number, { forumId: number; forumName: string; items: BellItem[] }>();
  for (const i of items) {
    const g = map.get(i.forumId) ?? { forumId: i.forumId, forumName: i.forumName, items: [] };
    g.items.push(i);
    map.set(i.forumId, g);
  }
  return [...map.values()].sort((a, b) => a.forumName.localeCompare(b.forumName, 'ru'));
}

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
  // По умолчанию — только сегодняшние, чтобы старые не путались с новыми
  const [onlyToday, setOnlyToday] = React.useState(true);
  const todayItems = React.useMemo(() => items.filter((i) => i.today), [items]);
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

  // Счётчик на колокольчике — новые среди сегодняшних
  const unseen = seen === null ? 0 : todayItems.filter((i) => !seen.has(itemKey(i))).length;

  const onOpenChange = (open: boolean) => {
    if (!open || seen === null) return;
    // Открыли список — всё в нём считается просмотренным
    setFresh(new Set(items.filter((i) => !seen.has(itemKey(i))).map(itemKey)));
    const next = new Set(items.map(itemKey));
    saveSeen(next);
    setSeen(next);
  };
  const list = onlyToday ? todayItems : items;
  const groups = KINDS.map((k) => ({ kind: k, items: list.filter((i) => i.kind === k) })).filter(
    (g) => g.items.length > 0,
  );
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-white/90 hover:bg-white/10"
          aria-label={
            unseen ? `Уведомления: новых ${unseen}` : `Уведомления за сегодня: ${todayItems.length}`
          }
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
          <div className="flex items-center gap-2">
            <div className="font-semibold">Уведомления</div>
            <div
              className="ml-auto inline-flex rounded-md border border-line bg-surface p-0.5 text-xs"
              role="tablist"
            >
              {[
                { today: true, label: `Сегодня (${todayItems.length})` },
                { today: false, label: `Все актуальные (${total})` },
              ].map((b) => (
                <button
                  key={b.label}
                  type="button"
                  role="tab"
                  aria-selected={onlyToday === b.today}
                  onClick={() => setOnlyToday(b.today)}
                  className={cn(
                    'rounded px-2 py-1',
                    onlyToday === b.today
                      ? 'bg-white font-medium text-brand shadow-sm'
                      : 'text-ink/70 hover:text-ink',
                  )}
                  data-testid={b.today ? 'bell-today' : 'bell-all'}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1 text-xs text-ink/60">
            {onlyToday
              ? `Что появилось сегодня: срок прошёл вчера, срок сегодня или через ${daysBefore} дн., задачи, которые пора начинать с сегодня.`
              : `Все невыполненные задачи: просроченные, срок в ближайшие ${daysBefore} дн. и те, которые пора начинать.`}
          </div>
        </div>
        <div className="thin-scroll max-h-[60vh] overflow-y-auto">
          {groups.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-status-gray">
              {onlyToday ? 'Сегодня новых уведомлений нет' : 'Всё в порядке — уведомлений нет'}
            </div>
          )}
          {groups.map((g) => (
            <section key={g.kind} data-testid={`bell-section-${g.kind}`}>
              <h3
                className={cn(
                  'sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-3 py-1.5 text-xs font-semibold',
                  COLOR[g.kind],
                )}
              >
                {SECTION[g.kind][onlyToday ? 'today' : 'all']}
                <span className="rounded-full bg-white px-2 text-ink/70">{g.items.length}</span>
              </h3>
              {byForum(g.items).map((f) => (
                <div key={f.forumId} data-testid="bell-forum">
                  <div className="flex items-center justify-between border-b border-line bg-white px-3 pb-1 pt-2 text-xs font-semibold text-ink/80">
                    <span className="truncate">{f.forumName}</span>
                    <span className="ml-2 shrink-0 text-ink/50">{f.items.length}</span>
                  </div>
                  <ul>
                    {f.items.map((i) => (
                      <li
                        key={`${i.kind}-${i.taskId}`}
                        className="border-b border-line last:border-0"
                      >
                        <Link
                          href={`/forums/${i.forumId}/tasks?q=${encodeURIComponent(i.description.slice(0, 40))}`}
                          className="block py-2 pl-5 pr-3 hover:bg-surface"
                        >
                          <div className="flex items-center gap-2 text-[11px]">
                            {fresh.has(itemKey(i)) && (
                              <span
                                className="size-2 shrink-0 rounded-full bg-brand"
                                title="Новое"
                                aria-label="Новое"
                              />
                            )}
                            {i.lag > 0 && (
                              <span className={cn('font-semibold', COLOR[i.kind])}>
                                +{i.lag} дн.
                              </span>
                            )}
                            <span className="ml-auto text-ink/60">
                              срок {formatDate(i.endDate)}
                            </span>
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-sm">
                            №{i.number}. {i.description}
                          </div>
                          {i.employees && <div className="text-xs text-ink/60">{i.employees}</div>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
        {!onlyToday && total > items.length && (
          <div className="border-t border-line px-3 py-2 text-xs text-ink/60">
            Показаны первые {items.length} из {total}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
