import { IncomeView } from '@/components/forum/income-view';
import { getIncomeItems } from '@/server/queries';

export default async function IncomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const items = await getIncomeItems(Number(id));
  return <IncomeView initialItems={items} />;
}
