import { IncomeView } from '@/components/forum/income-view';
import { getDeals, getIncomeConfig, getIncomeItems } from '@/server/queries';

export default async function IncomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [items, config, deals] = await Promise.all([
    getIncomeItems(Number(id)),
    getIncomeConfig(Number(id)),
    getDeals(Number(id)),
  ]);
  return (
    <IncomeView
      initialItems={items}
      initialConfig={config}
      initialDeals={deals.filter((d) => d.status === 'paid')}
    />
  );
}
