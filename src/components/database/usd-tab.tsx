'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field, Input, Select } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatDate, todayMsk, type ISODate } from '@/lib/dates';
import { forumUsdRate, usdRateOn, type UsdRateDTO } from '@/lib/usd';
import type { ForumDTO } from '@/lib/types';
import type { ActionResult } from '@/server/action-utils';
import { cn, parseAmount } from '@/lib/utils';
import { deleteUsdRate, setUsdRate } from '@/server/actions/dicts';

const rateFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 });
const fmt = (n: number) => rateFormat.format(n).replace(/[  ]/g, ' ');

/** Раздел «Курс $»: курс доллара по датам — для всех форумов или для конкретного форума. */
export function UsdTab({ rates: initial, forums }: { rates: UsdRateDTO[]; forums: ForumDTO[] }) {
  const confirm = useConfirm();
  const today = todayMsk();
  const [rates, setRates] = React.useState(initial);
  React.useEffect(() => setRates(initial), [initial]);
  const [date, setDate] = React.useState<ISODate | null>(today);
  const [rate, setRate] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  /** Выбранный форум: фильтр таблицы и форум, к которому привязывается новый курс; null — все форумы */
  const [forumId, setForumId] = React.useState<number | null>(null);

  const sortedForums = React.useMemo(
    () =>
      [...forums].sort(
        (a, b) => Number(a.archived) - Number(b.archived) || b.startDate.localeCompare(a.startDate),
      ),
    [forums],
  );
  const forumName = React.useMemo(() => new Map(forums.map((f) => [f.id, f.name])), [forums]);
  const forum = forumId === null ? null : (forums.find((f) => f.id === forumId) ?? null);
  const general = rates.filter((r) => r.forumId === null);
  const current = forum ? forumUsdRate(rates, forum, today) : usdRateOn(general, today);
  const hasOwn = forum ? rates.some((r) => r.forumId === forum.id) : false;

  const apply = (res: ActionResult<UsdRateDTO[]>, ok: string) => {
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setRates(res.data);
    toast.success(ok);
    return true;
  };

  const add = async () => {
    if (!date) return void toast.error('Укажите дату');
    const r = parseAmount(rate.replace(/[₽$]|руб\.?|р\./g, ''));
    if (r === null || r <= 0) return void toast.error('Укажите курс, например 82,5');
    setBusy(true);
    const res = await setUsdRate({ date, rate: r, forumId });
    setBusy(false);
    const whom = forum ? ` для «${forum.name}»` : ' для всех форумов';
    if (apply(res, `Курс на ${formatDate(date)}${whom} сохранён`)) setRate('');
  };

  const remove = async (r: UsdRateDTO) => {
    const ok = await confirm({
      title: `Удалить курс на ${formatDate(r.date)}?`,
      description: r.forumId
        ? `Курс для «${forumName.get(r.forumId) ?? 'форума'}»`
        : 'Курс для всех форумов',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await deleteUsdRate(r.id);
    setBusy(false);
    apply(res, 'Курс удалён');
  };

  const list = rates
    .filter((r) => forumId === null || r.forumId === forumId || r.forumId === null)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const whose = (r: UsdRateDTO) =>
    r.forumId === null ? 'Все форумы' : (forumName.get(r.forumId) ?? '—');

  return (
    <div>
      <div className="mb-3 rounded-md border border-line bg-surface p-3 text-sm text-ink/80">
        Курс доллара (рублей за 1 $) по датам. Новый курс добавляется к прежним, они не удаляются.
        Курс можно привязать к форуму: тогда форум считается только по своим курсам, а курсы «для
        всех форумов» на него не влияют. Берётся последний курс не позже сегодняшней даты, а у
        прошедшего форума — не позже даты его окончания, поэтому новые курсы не меняют суммы в
        прошедших форумах. По этому курсу считаются столбцы «$» в задачах, расходах и доходах и
        диаграммы отчётов в $.
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
        <Field label="Форум" className="w-72">
          <Select
            value={forumId ?? ''}
            onChange={(e) => setForumId(e.target.value ? Number(e.target.value) : null)}
            aria-label="Форум"
            data-testid="usd-tab-forum"
          >
            <option value="">Все форумы</option>
            {sortedForums.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.archived ? ' (архив)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Button onClick={() => void add()} disabled={busy} data-testid="usd-tab-add">
          <Plus /> Добавить курс
        </Button>
      </div>
      <div className="mb-3 text-sm" data-testid="usd-current">
        {current ? (
          <>
            {forum ? (
              <>
                В «{forum.name}» используется {hasOwn ? 'свой курс' : 'общий курс для всех форумов'}
                :{' '}
              </>
            ) : (
              'Для всех форумов без своего курса сейчас используется: '
            )}
            <b>1 $ = {fmt(current.rate)} р.</b>{' '}
            <span className="text-ink/60">(курс на {formatDate(current.date)})</span>
          </>
        ) : (
          <span className="text-status-red">
            {forum ? `У «${forum.name}» курса нет` : 'Курс для всех форумов не внесён'} — в столбцах
            «$» стоят прочерки
          </span>
        )}
      </div>
      <div className="max-w-3xl overflow-hidden rounded-lg border border-line bg-white">
        <table className="w-full text-sm" data-testid="usd-tab-table">
          <thead className="bg-surface text-left text-xs text-ink/70">
            <tr>
              <th className="px-3 py-2 font-medium">Дата</th>
              <th className="px-3 py-2 font-medium">Форум</th>
              <th className="px-3 py-2 text-right font-medium">Курс, р. за 1 $</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-status-gray">
                  Курсов пока нет
                </td>
              </tr>
            )}
            {list.map((r) => {
              const used = current?.id === r.id;
              // У форума со своими курсами общие курсы не действуют
              const inactive = hasOwn && r.forumId === null;
              return (
                <tr
                  key={r.id}
                  className={cn(
                    'border-t border-line/60',
                    used && 'bg-brand-light/50 font-medium',
                    inactive && 'text-ink/40',
                  )}
                >
                  <td className="px-3 py-1.5">
                    {formatDate(r.date)}
                    {used && (
                      <span className="ml-2 text-xs font-normal text-brand">используется</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">{whose(r)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.rate)}</td>
                  <td className="px-2 py-1 text-right">
                    <Button
                      variant="ghost"
                      size="iconSm"
                      title="Удалить"
                      aria-label={`Удалить курс на ${formatDate(r.date)} (${whose(r)})`}
                      onClick={() => void remove(r)}
                      disabled={busy}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
