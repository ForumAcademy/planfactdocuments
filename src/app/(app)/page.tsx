import { Breadcrumbs } from '@/components/layout/breadcrumbs';

export default function HomePage() {
  return (
    <>
      <Breadcrumbs items={[{ label: 'Форумы' }]} />
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        <h1 className="text-2xl font-semibold">Форумы</h1>
      </main>
    </>
  );
}
