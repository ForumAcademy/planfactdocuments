import { collectReminders, getSettings } from '@/server/reminders';
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
    const items: BellItem[] = all.slice(0, 500).map((i) => ({
      kind: i.kind,
      taskId: i.taskId,
      number: i.number,
      description: i.description,
      endDate: i.endDate,
      lag: i.lag,
      forumId: i.forumId,
      forumName: i.forumName,
      employees: i.employees.map((e) => e.fullName).join(', '),
    }));
    return <Bell items={items} total={all.length} daysBefore={settings.daysBefore} />;
  } catch {
    return null;
  }
}
