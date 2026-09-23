'use client';

import * as React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from './popover';
import { inputClass } from './input';
import {
  addDays,
  addMonths,
  formatDate,
  monthName,
  parseRuDate,
  startOfWeek,
  todayMsk,
  type ISODate,
} from '@/lib/dates';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Календарь на месяц. */
export function Calendar({
  value,
  onSelect,
  min,
}: {
  value: ISODate | null;
  onSelect: (d: ISODate) => void;
  min?: ISODate | null;
}) {
  const today = todayMsk();
  const [month, setMonth] = React.useState<ISODate>(() => `${(value ?? today).slice(0, 7)}-01`);
  const first = startOfWeek(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const title = `${monthName(month)} ${month.slice(0, 4)}`;
  return (
    <div className="w-64 select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="rounded p-1 hover:bg-surface"
          onClick={() => setMonth(addMonths(month, -1))}
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium capitalize">{title}</span>
        <button
          type="button"
          className="rounded p-1 hover:bg-surface"
          onClick={() => setMonth(addMonths(month, 1))}
          aria-label="Следующий месяц"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 text-status-gray">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const inMonth = d.slice(0, 7) === month.slice(0, 7);
          const disabled = Boolean(min && d < min);
          return (
            <button
              type="button"
              key={d}
              disabled={disabled}
              onClick={() => onSelect(d)}
              className={cn(
                'rounded py-1.5 text-sm hover:bg-brand-light disabled:opacity-30',
                !inMonth && 'text-status-gray/60',
                d === today && 'font-semibold text-brand ring-1 ring-brand/40',
                d === value && 'bg-brand text-white hover:bg-brand-dark',
              )}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between border-t border-line pt-2">
        <button
          type="button"
          className="text-xs text-brand hover:underline"
          onClick={() => onSelect(today)}
        >
          Сегодня
        </button>
      </div>
    </div>
  );
}

/** Поле даты в формате ДД.ММ.ГГГГ с календарём. */
export function DateInput({
  value,
  onChange,
  id,
  className,
  compact,
  min,
  placeholder = 'ДД.ММ.ГГГГ',
  clearable = true,
  autoFocus,
  ariaLabel,
  disabled,
}: {
  value: ISODate | null;
  onChange: (v: ISODate | null) => void;
  id?: string;
  className?: string;
  compact?: boolean;
  min?: ISODate | null;
  placeholder?: string;
  clearable?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const [text, setText] = React.useState(formatDate(value));
  const [open, setOpen] = React.useState(false);
  const [invalid, setInvalid] = React.useState(false);

  React.useEffect(() => {
    setText(formatDate(value));
    setInvalid(false);
  }, [value]);

  const commit = () => {
    const t = text.trim();
    if (!t) {
      if (clearable) {
        if (value !== null) onChange(null);
      } else setText(formatDate(value));
      setInvalid(false);
      return;
    }
    const parsed = parseRuDate(t);
    if (!parsed) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (parsed !== value) onChange(parsed);
    else setText(formatDate(parsed));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn('relative', className)}>
          <input
            id={id}
            aria-label={ariaLabel}
            value={text}
            disabled={disabled}
            autoFocus={autoFocus}
            inputMode="numeric"
            placeholder={placeholder}
            onChange={(e) => {
              // Автоматическая подстановка точек: 23092026 → 23.09.2026
              let v = e.target.value.replace(/[^\d.]/g, '');
              if (/^\d{8}$/.test(v)) v = `${v.slice(0, 2)}.${v.slice(2, 4)}.${v.slice(4)}`;
              setText(v);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
              if (e.key === 'ArrowDown' && e.altKey) setOpen(true);
            }}
            className={cn(
              inputClass,
              'pr-8 tabular-nums',
              compact && 'h-8 px-2 text-xs',
              invalid && 'border-status-red focus:border-status-red focus:ring-status-red/20',
            )}
          />
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-status-gray hover:text-brand"
            aria-label="Открыть календарь"
          >
            <CalendarDays className={compact ? 'size-3.5' : 'size-4'} />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <Calendar
          value={value}
          min={min}
          onSelect={(d) => {
            onChange(d);
            setText(formatDate(d));
            setInvalid(false);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
