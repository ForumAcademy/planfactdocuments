import { addDays, todayMsk } from '@/lib/dates';
import { collectReminders, getSettings, type ReminderItem } from '@/server/reminders';
import { Bell, type BellItem } from './bell';

export async function BellServer() {
  try {
    const settings = await getSettings();
    const all = await collectReminders(undefined, settings.daysBefore);
    const order = { overdue: 0, due_soon: 1, should_start: 2 };
    all.sort(
      (a, b) =>
        order[a.kind] - order[b.kind] ||
        b.lag - a.lag ||
        (a.endDate ?? '').localeCompare(b.endDate ?? ''),
    );
    const today = todayMsk();
    const soon = addDays(today, settings.daysBefore);
    // «Сегодня» — то, что появилось сегодня: срок прошёл вчера, срок сегодня или только что
    // вошёл в окно «скоро срок», дата начала — сегодня
    const isToday = (i: ReminderItem) =>
      i.kind === 'overdue'
        ? i.lag === 1
        : i.kind === 'due_soon'
          ? i.endDate === today || i.endDate === soon
          : i.startDate === today;
    const fresh = all.filter(isToday);
    const rest = all.filter((i) => !isToday(i)).slice(0, Math.max(0, 500 - fresh.length));
    const items: BellItem[] = [...fresh, ...rest].map((i) => ({
      kind: i.kind,
      taskId: i.taskId,
      number: i.number,
      description: i.description,
      endDate: i.endDate,
      lag: i.lag,
      forumId: i.forumId,
      forumName: i.forumName,
      employees: i.employees.map((e) => e.fullName).join(', '),
      today: isToday(i),
    }));
    return <Bell items={items} total={all.length} daysBefore={settings.daysBefore} />;
  } catch {
    return null;
  }
}
