import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { DatabaseView } from '@/components/database/database-view';
import { getDatabaseData } from '@/server/queries';

export const metadata: Metadata = { title: 'База данных — Статус форумы' };

export default async function DatabasePage() {
  const data = await getDatabaseData();
  return (
    <>
      <Breadcrumbs items={[{ label: 'Форумы', href: '/' }, { label: 'База данных' }]} />
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        <Suspense>
          <DatabaseView data={data} />
        </Suspense>
      </main>
    </>
  );
}
