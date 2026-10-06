'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate, monthName, todayMsk, type ISODate } from '@/lib/dates';
import { cn } from '@/lib/utils';
import {
  CALENDAR_KIND_LABEL,
  makeCalendar,
  type CalendarDayDTO,
  type CalendarKind,
} from '@/lib/work-calendar';
import { setCalendarDay } from '@/server/actions/dicts';

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` as ISODate;

/** Раздел «Производственный календарь»: праздники, переносы и сокращённые дни по годам. */
export function CalendarTab({ days: initial }: { days: CalendarDayDTO[] }) {
  const [days, setDays] = React.useState(initial);
  React.useEffect(() => setDays(initial), [initial]);
  const [year, setYear] = React.useState(() => Number(todayMsk().slice(0, 4)));
  const cal = React.useMemo(() => makeCalendar(days), [days]);

  let workdays = 0;
  let offdays = 0;
  for (let m = 0; m < 12; m++) {
    const n = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    for (let d = 1; d <= n; d++) {
      if (cal.isOff(iso(year, m, d))) offdays++;
      else workdays++;
    }
  }
  const marked = days.filter((d) => d.date.startsWith(String(year))).length;

  return (
    <div>
      <div className="mb-3 rounded-md border border-line bg-surface p-3 text-sm text-ink/80">
        Суббота и воскресенье — выходные по умолчанию. Здесь отмечаются праздники, переносы выходных
        и сокращённые дни. Если дата начала или окончания задачи или форума выпадает на нерабочий
        день, сайт покажет предупреждение. Нажмите на день, чтобы изменить его тип.
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          aria-label="Предыдущий год"
          onClick={() => setYear((y) => y - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-16 text-center text-xl font-semibold tabular-nums">{year}</span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Следующий год"
          onClick={() => setYear((y) => y + 1)}
        >
          <ChevronRight />
        </Button>
        <span className="text-sm text-ink/70">
          Рабочих дней: <b className="text-ink">{workdays}</b> · выходных и праздничных:{' '}
          <b className="text-ink">{offdays}</b>
        </span>
        {marked === 0 && (
          <span className="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-800">
            Праздники на {year} год не внесены
          </span>
        )}
        <Legend />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, m) => (
          <Month key={m} year={year} month={m} cal={cal} onChange={setDays} />
        ))}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="ml-auto flex flex-wrap gap-3 text-xs text-ink/70">
      <span className="inline-flex items-center gap-1">
        <span className="size-3 rounded-sm bg-red-100" /> выходной
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-3 rounded-sm bg-status-red" /> праздник
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-3 rounded-sm border-2 border-brand bg-white" /> рабочий (перенос)
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-3 rounded-sm bg-gray-300" /> сокращённый
      </span>
    </div>
  );
}

function Month({
  year,
  month,
  cal,
  onChange,
}: {
  year: number;
  month: number;
  cal: ReturnType<typeof makeCalendar>;
  onChange: (d: CalendarDayDTO[]) => void;
}) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const offset = (first + 6) % 7;
  const n = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const today = todayMsk();
  return (
    <div className="rounded-md border border-line bg-white p-3" data-testid="calendar-month">
      <div className="mb-2 text-center font-semibold capitalize">
        {monthName(iso(year, month, 1))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WD.map((w, i) => (
          <div key={w} className={cn('pb-1 text-ink/50', i >= 5 && 'text-status-red/70')}>
            {w}
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const date = iso(year, month, i + 1);
          return (
            <DayCell
              key={date}
              date={date}
              cal={cal}
              isToday={date === today}
              onChange={onChange}
            />
          );
        })}
      </div>
    </div>
  );
}

function DayCell({
  date,
  cal,
  isToday,
  onChange,
}: {
  date: ISODate;
  cal: ReturnType<typeof makeCalendar>;
  isToday: boolean;
  onChange: (d: CalendarDayDTO[]) => void;
}) {
  const info = cal.day(date);
  const off = cal.isOff(date);
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState(info?.note ?? '');
  React.useEffect(() => setNote(info?.note ?? ''), [info?.note, open]);

  const save = async (kind: CalendarKind | null) => {
    const res = await setCalendarDay({ date, kind, note: kind ? note : null });
    if (!res.ok) return void toast.error(res.error);
    onChange(res.data);
    setOpen(false);
    toast.success('Календарь обновлён', { id: 'calendar' });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={
            info
              ? `${CALENDAR_KIND_LABEL[info.kind]}${info.note ? ` — ${info.note}` : ''}`
              : off
                ? 'Выходной'
                : 'Рабочий день'
          }
          className={cn(
            'h-7 rounded tabular-nums transition hover:ring-2 hover:ring-brand/40',
            info?.kind === 'holiday'
              ? 'bg-status-red font-semibold text-white'
              : info?.kind === 'short'
                ? 'bg-gray-300 text-ink'
                : info?.kind === 'workday'
                  ? 'border-2 border-brand bg-white font-semibold text-brand'
                  : off
                    ? 'bg-red-100 text-status-red'
                    : 'text-ink',
            isToday && 'underline decoration-2 underline-offset-2',
          )}
          data-testid={`cal-${date}`}
        >
          {Number(date.slice(8))}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-1 p-2">
        <div className="px-1 pb-1 text-sm font-medium">{formatDate(date)}</div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Подпись, например «День России»"
          className="h-8 text-xs"
        />
        {(['holiday', 'workday', 'short'] as CalendarKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => void save(k)}
            className={cn(
              'block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-surface',
              info?.kind === k && 'bg-brand-light font-medium text-brand',
            )}
          >
            {CALENDAR_KIND_LABEL[k]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void save(null)}
          className={cn(
            'block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-surface',
            !info && 'bg-brand-light font-medium text-brand',
          )}
        >
          Обычный день (сб, вс — выходные)
        </button>
      </PopoverContent>
    </Popover>
  );
}
