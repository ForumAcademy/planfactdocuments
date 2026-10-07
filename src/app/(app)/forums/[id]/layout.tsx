import { notFound } from 'next/navigation';
import { ForumProvider } from '@/components/forum/forum-context';
import { ForumBreadcrumbs, ForumHeader } from '@/components/forum/forum-header';
import { TaskPanel } from '@/components/forum/task-panel';
import { todayMsk } from '@/lib/dates';
import {
  getDeals,
  getDicts,
  getForum,
  getForumOptions,
  getIncomeConfig,
  getIncomeItems,
  getTasks,
  getTemplateGap,
} from '@/server/queries';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const forum = await getForum(Number(id));
  return { title: forum ? `${forum.name} — Статус форумы` : 'Форум не найден' };
}

export default async function ForumLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const forumId = Number(id);
  const forum = await getForum(forumId);
  if (!forum) notFound();
  const [tasks, dicts, options, incomeItems, incomeConfig, deals] = await Promise.all([
    getTasks(forumId),
    getDicts(),
    getForumOptions(),
    getIncomeItems(forumId),
    getIncomeConfig(forumId),
    getDeals(forumId),
  ]);
  const templateGap = await getTemplateGap(tasks);
  return (
    <ForumProvider forum={forum} tasks={tasks} dicts={dicts} today={todayMsk()}>
      <ForumBreadcrumbs />
      <ForumHeader
        forumOptions={options.filter((o) => o.id !== forumId)}
        templateGap={templateGap}
        income={{
          items: incomeItems,
          config: incomeConfig,
          deals: deals.filter((d) => d.status === 'paid'),
        }}
      />
      {children}
      <TaskPanel />
    </ForumProvider>
  );
}
