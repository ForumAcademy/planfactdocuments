import { IncomeView } from '@/components/forum/income-view';
import { getDeals, getIncomeConfig, getIncomeItems, getIncomePlanHistory } from '@/server/queries';

export default async function IncomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [items, config, deals, history] = await Promise.all([
    getIncomeItems(Number(id)),
    getIncomeConfig(Number(id)),
    getDeals(Number(id)),
    getIncomePlanHistory(Number(id)),
  ]);
  return (
    <IncomeView
      initialItems={items}
      initialConfig={config}
      initialDeals={deals.filter((d) => d.status === 'paid')}
      initialHistory={history}
    />
  );
}
