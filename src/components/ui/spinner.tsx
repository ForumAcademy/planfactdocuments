import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-status-gray', className)}>
      <Loader2 className="size-4 animate-spin" />
      {label}
    </span>
  );
}
