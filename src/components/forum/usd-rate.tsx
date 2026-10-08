'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { DollarSign, History } from 'lucide-react';
import { formatDate } from '@/lib/dates';
import { cn, parseAmount } from '@/lib/utils';
import { setUsdRate } from '@/server/actions/dicts';
import { useForum } from './forum-context';

const rateFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 });

/**
 * Курс доллара на сегодня в шапке форума (из «База данных» → «Курс $»). По клику — поле ввода:
 * введённый курс сохраняется в базу на сегодняшнюю дату. По нему считаются столбцы «$».
 */
export function UsdRate() {
  const { forum, today } = useForum();
  const router = useRouter();
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
    const res = await setUsdRate({ date: today, rate: next });
    if (!res.ok) {
      setRate(prev);
      toast.error(res.error);
      return;
    }
    toast.success(`Курс на ${formatDate(today)} сохранён в базе данных`);
    router.refresh();
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
        р. на {formatDate(today)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
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
        title="Курс доллара на сегодня: по нему считаются столбцы «$» в задачах, расходах, доходах и диаграммы в $. Нажмите, чтобы внести курс на сегодня"
        data-testid="usd-rate"
      >
        <DollarSign className="size-3.5" />
        {rate ? `1 $ = ${rateFormat.format(rate)} р.` : 'Задать курс $'}
        {rate && forum.usdRateDate && forum.usdRateDate !== today && (
          <span className="text-xs text-ink/50">(курс на {formatDate(forum.usdRateDate)})</span>
        )}
      </button>
      <Link
        href="/database?tab=usd"
        className="rounded p-0.5 text-ink/40 hover:bg-brand-light hover:text-brand"
        title="Курсы по датам — «База данных» → «Курс $»"
        aria-label="Курсы по датам"
      >
        <History className="size-3.5" />
      </Link>
    </span>
  );
}
