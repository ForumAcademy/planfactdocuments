import { FunnelView } from '@/components/forum/funnel-view';
import { getDeals, getIncomeConfig, getIncomeItems } from '@/server/queries';

export default async function FunnelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const forumId = Number(id);
  const [deals, items, config] = await Promise.all([
    getDeals(forumId),
    getIncomeItems(forumId),
    getIncomeConfig(forumId),
  ]);
  return <FunnelView initialDeals={deals} items={items} config={config} />;
}
