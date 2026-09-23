'use client';

import * as React from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn } from '@/lib/utils';

export interface Option {
  value: string;
  label: string;
  hint?: string;
  color?: string;
}

/** Выбор нескольких значений с поиском. */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Выберите…',
  className,
  compact,
  emptyText = 'Ничего не найдено',
  searchable = true,
  disabled,
  ariaLabel,
}: {
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  emptyText?: string;
  searchable?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const selected = new Set(value);
  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }, [options, q]);
  const labels = options.filter((o) => selected.has(o.value)).map((o) => o.label);

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ('');
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            'flex w-full items-center justify-between gap-1 rounded-md border border-line bg-white px-2.5 text-left text-sm hover:border-brand/50 disabled:opacity-60',
            compact ? 'min-h-8 py-1' : 'min-h-9 py-1.5',
            value.length > 0 && 'border-brand/60',
            className,
          )}
        >
          <span className={cn('line-clamp-2', labels.length === 0 && 'text-status-gray')}>
            {labels.length === 0
              ? placeholder
              : labels.length <= 2
                ? labels.join(', ')
                : `${labels[0]} и ещё ${labels.length - 1}`}
          </span>
          <ChevronDown className="size-4 shrink-0 text-status-gray" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        onOpenAutoFocus={(e) => {
          if (!searchable) e.preventDefault();
        }}
      >
        {searchable && (
          <div className="flex items-center gap-2 border-b border-line px-2">
            <Search className="size-4 text-status-gray" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск…"
              className="h-9 w-full bg-transparent text-sm outline-none"
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <div className="px-2 py-3 text-sm text-status-gray">{emptyText}</div>
          )}
          {filtered.map((o) => (
            <button
              type="button"
              key={o.value}
              onClick={() => toggle(o.value)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface"
            >
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded border',
                  selected.has(o.value) ? 'border-brand bg-brand text-white' : 'border-line',
                )}
              >
                {selected.has(o.value) && <Check className="size-3" />}
              </span>
              {o.color && (
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} />
              )}
              <span className="flex-1">
                {o.label}
                {o.hint && <span className="block text-xs text-status-gray">{o.hint}</span>}
              </span>
            </button>
          ))}
        </div>
        {value.length > 0 && (
          <div className="border-t border-line p-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-xs text-status-gray hover:bg-surface"
            >
              <X className="size-3" /> Очистить выбор
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
