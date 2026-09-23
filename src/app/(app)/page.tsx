import Link from 'next/link';
import { ArrowDownNarrowWide, ArrowUpNarrowWide, Database } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { ForumCard } from '@/components/forums/forum-card';
import { NewForumButton } from '@/components/forums/new-forum-button';
import { buttonVariants } from '@/components/ui/button';
import { todayMsk } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { getForumOptions, getForumsForHome } from '@/server/queries';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const archived = sp.view === 'archive';
  const desc = sp.sort === 'desc';
  const [forums, options] = await Promise.all([getForumsForHome(archived), getForumOptions()]);
  forums.sort((a, b) =>
    desc ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate),
  );
  const today = todayMsk();
  const q = (p: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    const view = 'view' in p ? p.view : sp.view;
    const sort = 'sort' in p ? p.sort : sp.sort;
    if (view) s.set('view', view);
    if (sort) s.set('sort', sort);
    const str = s.toString();
    return str ? `/?${str}` : '/';
  };

  return (
    <>
      <Breadcrumbs items={[{ label: 'Форумы' }]} />
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-2xl font-semibold">Форумы</h1>
          <Link href="/database" className={cn(buttonVariants({ variant: 'dark', size: 'lg' }))}>
            <Database /> База данных
          </Link>
          <NewForumButton forumOptions={options} />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-line bg-surface p-0.5 text-sm">
            <Link
              href={q({ view: undefined })}
              className={cn(
                'rounded px-3 py-1.5',
                !archived ? 'bg-white font-medium text-brand shadow-sm' : 'text-ink/70',
              )}
            >
              Активные
            </Link>
            <Link
              href={q({ view: 'archive' })}
              className={cn(
                'rounded px-3 py-1.5',
                archived ? 'bg-white font-medium text-brand shadow-sm' : 'text-ink/70',
              )}
            >
              Архив
            </Link>
          </div>
          <Link
            href={q({ sort: desc ? undefined : 'desc' })}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            title="Сортировка по дате форума"
          >
            {desc ? <ArrowDownNarrowWide /> : <ArrowUpNarrowWide />}
            Дата форума: {desc ? 'сначала поздние' : 'сначала ближайшие'}
          </Link>
        </div>

        {forums.length === 0 ? (
          <div className="mt-10 rounded-md border border-dashed border-line p-10 text-center text-ink/70">
            {archived
              ? 'В архиве пока нет форумов.'
              : 'Форумов пока нет. Создайте первый — кнопка «+ Новый форум».'}
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {forums.map(({ tasks, ...forum }) => (
              <ForumCard
                key={forum.id}
                forum={forum}
                tasks={tasks}
                today={today}
                forumOptions={options.filter((o) => o.id !== forum.id)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
