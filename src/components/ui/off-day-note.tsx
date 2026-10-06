import { CalendarX2 } from 'lucide-react';

/** Предупреждение: дата выпадает на выходной или праздник (по производственному календарю). */
export function OffDayNote({ reason }: { reason: string | null | undefined }) {
  if (!reason) return null;
  return (
    <p
      className="mt-1 flex items-start gap-1 rounded bg-yellow-50 px-1.5 py-1 text-xs text-yellow-800"
      role="status"
      data-testid="off-day-note"
    >
      <CalendarX2 className="mt-px size-3.5 shrink-0" />
      <span>Нерабочий день — {reason}</span>
    </p>
  );
}
