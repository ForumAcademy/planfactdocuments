import { TrendingUp } from 'lucide-react';
import { SectionPlaceholder } from '@/components/forum/section-placeholder';

export default function IncomePage() {
  return (
    <SectionPlaceholder
      icon={TrendingUp}
      title="Линия доходов"
      description="Плановые и фактические поступления: продажи билетов, спонсорство и другие источники."
    />
  );
}
