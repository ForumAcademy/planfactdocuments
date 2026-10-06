import { Filter } from 'lucide-react';
import { SectionPlaceholder } from '@/components/forum/section-placeholder';

export default function FunnelPage() {
  return (
    <SectionPlaceholder
      icon={Filter}
      title="Воронка продаж"
      description="Движение продаж по этапам: от заявок до оплат."
    />
  );
}
