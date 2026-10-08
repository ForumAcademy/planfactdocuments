'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { DollarSign } from 'lucide-react';
import { cn, parseAmount } from '@/lib/utils';
import { setUsdRate } from '@/server/actions/forums';
import { useForum } from './forum-context';

const rateFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 });

/** Курс доллара форума в шапке: по клику — поле ввода; по нему считаются столбцы «$». */
export function UsdRate() {
  const { forum } = useForum();
  const [rate, setRate] = React.useState(forum.usdRate);
  React.useEffect(() => setRate(forum.usdRate), [forum.usdRate]);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const commit = async () => {
    setEditing(false);
    // Пустое поле — отмена: снятый курс оставил бы диаграммы в $ без пересчёта
    const text = draft.replace(/[₽$]|руб\.?|р\./g, '').trim();
    if (!text) return;
    const next = parseAmount(text);
    if (next == null) return void toast.error('Не удалось разобрать курс');
    if (next <= 0) return void toast.error('Курс должен быть больше нуля');
    if (next === rate) return;
    const prev = rate;
    setRate(next);
    const res = await setUsdRate(forum.id, next);
    if (!res.ok) {
      setRate(prev);
      toast.error(res.error);
    }
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <DollarSign className="size-3.5" /> 1 $ =
        <input
          autoFocus
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder="напр. 82,5"
          className="h-6 w-24 rounded border border-brand bg-white px-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/20"
          aria-label="Курс доллара, руб. за 1 $"
          data-testid="usd-rate-input"
        />
        р.
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(rate ? String(rate).replace('.', ',') : '');
        setEditing(true);
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1 hover:bg-brand-light',
        !rate && 'text-brand',
      )}
      title="Курс доллара: по нему считаются столбцы «$» в задачах, расходах, доходах и диаграммы в $"
      data-testid="usd-rate"
    >
      <DollarSign className="size-3.5" />
      {rate ? `1 $ = ${rateFormat.format(rate)} р.` : 'Задать курс $'}
    </button>
  );
}
