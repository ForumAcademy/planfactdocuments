'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/** Число, редактируемое по клику (стоимость или количество). */
export function NumberCell({
  value,
  format,
  label,
  onCommit,
  testId,
  className,
  inputClassName,
}: {
  value: number;
  format: (n: number) => string;
  label: string;
  onCommit: (n: number) => void;
  testId: string;
  className?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const commit = () => {
    setEditing(false);
    if (!draft.trim()) return;
    const n = Math.round(Number(draft.replace(/шт\.?|[\s  ₽]/g, '').replace(',', '.')));
    if (!Number.isFinite(n) || n < 0) return;
    if (n !== value) onCommit(n);
  };
  if (editing) {
    return (
      <input
        autoFocus
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className={cn(
          'h-7 w-full rounded border border-brand bg-white px-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/20',
          inputClassName,
        )}
        aria-label={label}
        data-testid={`${testId}-input`}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className={cn(
        'w-full whitespace-nowrap rounded px-1 py-0.5 text-right tabular-nums hover:bg-brand-light',
        value ? 'text-ink' : 'text-status-gray',
        className,
      )}
      title="Изменить"
      data-testid={testId}
    >
      {format(value)}
    </button>
  );
}
