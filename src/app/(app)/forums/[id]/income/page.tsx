import { IncomeView } from '@/components/forum/income-view';
import { getIncomeConfig, getIncomeItems } from '@/server/queries';

export default async function IncomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [items, config] = await Promise.all([
    getIncomeItems(Number(id)),
    getIncomeConfig(Number(id)),
  ]);
  return <IncomeView initialItems={items} initialConfig={config} />;
}
