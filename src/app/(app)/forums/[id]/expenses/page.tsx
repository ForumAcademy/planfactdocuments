import { Wallet } from 'lucide-react';
import { SectionPlaceholder } from '@/components/forum/section-placeholder';

export default function ExpensesPage() {
  return (
    <SectionPlaceholder
      icon={Wallet}
      title="Линия расходов"
      description="Плановые и фактические расходы форума по статьям и срокам."
    />
  );
}
