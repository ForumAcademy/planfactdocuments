import { Check } from 'lucide-react';
import { STATUS_LABEL, TONE_COLOR, badgeTone, doneLateDays, type StatusInput } from '@/lib/status';
import type { ISODate } from '@/lib/dates';

export function StatusBadge({ task, today }: { task: StatusInput; today: ISODate }) {
  const tone = badgeTone(task, today);
  const late = doneLateDays(task);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium text-white"
        style={{ backgroundColor: TONE_COLOR[tone] }}
      >
        {task.status === 'DONE' && <Check className="size-3" />}
        {STATUS_LABEL[task.status]}
      </span>
      {late > 0 && (
        <span className="whitespace-nowrap text-xs text-status-red">с опозданием {late} дн.</span>
      )}
    </span>
  );
}
