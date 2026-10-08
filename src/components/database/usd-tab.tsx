'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field, Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatDate, todayMsk, type ISODate } from '@/lib/dates';
import { usdRateOn, type UsdRateDTO } from '@/lib/usd';
import { cn, parseAmount } from '@/lib/utils';
import { setUsdRate } from '@/server/actions/dicts';

const rateFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 });
const fmt = (n: number) => rateFormat.format(n).replace(/[  ]/g, ' ');

/** Раздел «Курс $»: курс доллара по датам; столбцы «$» считаются по курсу на сегодня. */
export function UsdTab({ rates: initial }: { rates: UsdRateDTO[] }) {
  const confirm = useConfirm();
  const today = todayMsk();
  const [rates, setRates] = React.useState(initial);
  React.useEffect(() => setRates(initial), [initial]);
  const [date, setDate] = React.useState<ISODate | null>(today);
  const [rate, setRate] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const current = usdRateOn(rates, today);

  const save = async (d: ISODate, r: number | null) => {
    setBusy(true);
    const res = await setUsdRate({ date: d, rate: r });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setRates(res.data);
    toast.success(r === null ? 'Курс удалён' : `Курс на ${formatDate(d)} сохранён`);
    return true;
  };

  const add = async () => {
    if (!date) return void toast.error('Укажите дату');
    const r = parseAmount(rate.replace(/[₽$]|руб\.?|р\./g, ''));
    if (r === null || r <= 0) return void toast.error('Укажите курс, например 82,5');
    if (await save(date, r)) setRate('');
  };

  const remove = async (r: UsdRateDTO) => {
    const ok = await confirm({
      title: `Удалить курс на ${formatDate(r.date)}?`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (ok) await save(r.date, null);
  };

  const list = [...rates].reverse();

  return (
    <div>
      <div className="mb-3 rounded-md border border-line bg-surface p-3 text-sm text-ink/80">
        Курс доллара (рублей за 1 $) по датам. Столбцы «$» в задачах, расходах и доходах и диаграммы
        отчётов в $ считаются из рублей по курсу на сегодня: последнему, внесённому не позже
        сегодняшней даты. Курс на сегодня можно внести и в шапке любого форума.
      </div>
      <div className="mb-4 text-sm" data-testid="usd-current">
        {current ? (
          <>
            Сейчас используется: <b>1 $ = {fmt(current.rate)} р.</b>{' '}
            <span className="text-ink/60">(курс на {formatDate(current.date)})</span>
          </>
        ) : (
          <span className="text-status-red">Курс не внесён — в столбцах «$» стоят прочерки</span>
        )}
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Дата" className="w-44">
          <DateInput value={date} onChange={setDate} clearable={false} ariaLabel="Дата курса" />
        </Field>
        <Field label="Курс, р. за 1 $" className="w-40">
          <Input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            inputMode="decimal"
            placeholder="напр. 82,5"
            data-testid="usd-tab-rate"
          />
        </Field>
        <Button onClick={() => void add()} disabled={busy} data-testid="usd-tab-add">
          <Plus /> Сохранить курс
        </Button>
      </div>
      <div className="max-w-xl overflow-hidden rounded-lg border border-line bg-white">
        <table className="w-full text-sm" data-testid="usd-tab-table">
          <thead className="bg-surface text-left text-xs text-ink/70">
            <tr>
              <th className="px-3 py-2 font-medium">Дата</th>
              <th className="px-3 py-2 text-right font-medium">Курс, р. за 1 $</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-status-gray">
                  Курсов пока нет
                </td>
              </tr>
            )}
            {list.map((r) => (
              <tr
                key={r.date}
                className={cn(
                  'border-t border-line/60',
                  current?.date === r.date && 'bg-brand-light/50 font-medium',
                )}
              >
                <td className="px-3 py-1.5">
                  {formatDate(r.date)}
                  {current?.date === r.date && (
                    <span className="ml-2 text-xs font-normal text-brand">используется</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.rate)}</td>
                <td className="px-2 py-1 text-right">
                  <Button
                    variant="ghost"
                    size="iconSm"
                    title="Удалить"
                    aria-label={`Удалить курс на ${formatDate(r.date)}`}
                    onClick={() => void remove(r)}
                    disabled={busy}
                  >
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
