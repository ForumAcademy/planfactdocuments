'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { formatDate } from '@/lib/dates';
import { computeTaskDates, type ForumRefs } from '@/lib/plan';
import { cn } from '@/lib/utils';
import { Popover, PopoverAnchor, PopoverContent } from './popover';

/** Пример форума для расчёта, когда реального нет (справочник, мастер-план). */
export const EXAMPLE_FORUM: ForumRefs = {
  startDate: '2027-03-10',
  endDate: '2027-03-11',
  salesStartDate: '2026-11-10',
};

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/**
 * Поле «Срок»: выпадающий список формулировок из справочника с поиском по словам.
 * Можно выбрать формулировку или ввести свою — она сохраняется как есть.
 * Рядом с каждой формулировкой — даты, которые она даст для этого форума.
 */
export function TermCombobox({
  value,
  onCommit,
  options,
  forum,
  stage,
  autoFocus,
  onCancel,
  onDone,
  onDraftChange,
  className,
  inputClassName,
  id,
}: {
  value: string;
  /** Вызывается при выборе из списка, Enter или уходе из поля (если текст изменился) */
  onCommit: (v: string) => void;
  options: string[];
  forum?: ForumRefs;
  stage?: { name: string; order: number } | null;
  autoFocus?: boolean;
  onCancel?: () => void;
  /** Поле закрыто (выбор, Enter, уход из поля) — даже если текст не изменился */
  onDone?: () => void;
  /** Каждое изменение текста (для форм, которые сохраняются своей кнопкой) */
  onDraftChange?: (v: string) => void;
  className?: string;
  inputClassName?: string;
  id?: string;
}) {
  const [draft, setDraft] = React.useState(value);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const committed = React.useRef(false);
  // Выбирали ли пункт стрелками — тогда Enter берёт его, иначе сохраняет введённый текст
  const navigated = React.useRef(false);

  React.useEffect(() => setDraft(value), [value]);
  React.useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const filtered = React.useMemo(() => {
    const words = norm(draft).split(' ').filter(Boolean);
    // Пока текст совпадает с текущим значением — показываем весь список
    const all = norm(draft) === norm(value) || words.length === 0;
    return options.filter((o) => all || words.every((w) => norm(o).includes(w))).slice(0, 80);
  }, [draft, options, value]);

  React.useEffect(() => {
    setActive(0);
    navigated.current = false;
  }, [draft]);
  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const commit = (v: string) => {
    committed.current = true;
    const t = v.replace(/\s+/g, ' ').trim();
    setDraft(t);
    onDraftChange?.(t);
    setOpen(false);
    if (t !== value.trim()) onCommit(t);
    onDone?.();
  };

  const preview = (text: string) => {
    const f = forum ?? EXAMPLE_FORUM;
    const r = computeTaskDates(text, stage, f);
    return r.needsClarification
      ? { ok: false, label: 'примерный — весь этап' }
      : {
          ok: true,
          label:
            r.startDate === r.endDate
              ? formatDate(r.startDate)
              : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`,
        };
  };

  return (
    <Popover open={open && (filtered.length > 0 || Boolean(draft.trim()))} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn('relative', className)}>
          <input
            ref={inputRef}
            id={id}
            value={draft}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            autoComplete="off"
            placeholder="Выберите или введите срок…"
            onChange={(e) => {
              setDraft(e.target.value);
              onDraftChange?.(e.target.value);
              setOpen(true);
            }}
            onFocus={(e) => {
              committed.current = false;
              // Текст выделяется целиком — ввод сразу начинает поиск заново
              e.currentTarget.select();
              setOpen(true);
            }}
            onClick={() => setOpen(true)}
            onBlur={() => {
              // Клик по пункту списка обрабатывается раньше (onMouseDown)
              if (!committed.current) commit(draft);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setOpen(true);
                navigated.current = true;
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigated.current = true;
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                // Стрелками выбрали пункт — берём его; иначе первую формулировку, в которой есть
                // все введённые слова. Нет совпадений — сохраняется свой вариант как есть
                const pick =
                  open && navigated.current
                    ? filtered[active]
                    : norm(draft) !== norm(value) && filtered.length
                      ? filtered[0]
                      : undefined;
                commit(pick ?? draft);
                inputRef.current?.blur();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                committed.current = true;
                setDraft(value);
                setOpen(false);
                onCancel?.();
                inputRef.current?.blur();
              }
            }}
            className={cn(
              'h-9 w-full rounded-md border border-line bg-white pl-3 pr-8 text-sm text-ink placeholder:text-status-gray focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20',
              inputClassName,
            )}
            data-testid="term-input"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label="Показать формулировки"
            className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center text-status-gray hover:text-ink"
            onMouseDown={(e) => {
              e.preventDefault();
              inputRef.current?.focus();
              setOpen((o) => !o);
            }}
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (e.target instanceof Node && inputRef.current?.parentElement?.contains(e.target))
            e.preventDefault();
        }}
      >
        <div
          ref={listRef}
          role="listbox"
          className="thin-scroll max-h-72 overflow-y-auto"
          data-testid="term-options"
        >
          {filtered.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-ink/60">
              В справочнике «Сроки» такой формулировки нет
            </div>
          )}
          {filtered.map((o, i) => {
            const p = preview(o);
            return (
              <div
                key={o}
                role="option"
                aria-selected={i === active}
                data-index={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(o);
                  inputRef.current?.blur();
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'cursor-pointer rounded px-2 py-1.5 text-sm',
                  i === active ? 'bg-brand-light' : 'hover:bg-surface',
                )}
              >
                <div className="leading-snug">{o}</div>
                <div className={cn('text-[11px]', p.ok ? 'text-ink/60' : 'text-yellow-700')}>
                  {p.label}
                </div>
              </div>
            );
          })}
        </div>
        {!options.some((o) => norm(o) === norm(draft)) &&
          draft.trim() &&
          norm(draft) !== norm(value) && (
            <div className="border-t border-line px-2 py-1.5 text-[11px] text-ink/60">
              {filtered.length
                ? `Enter — выбрать «${filtered[0]}»`
                : `Enter — сохранить свой вариант «${draft.trim()}» (${preview(draft).label})`}
            </div>
          )}
      </PopoverContent>
    </Popover>
  );
}
