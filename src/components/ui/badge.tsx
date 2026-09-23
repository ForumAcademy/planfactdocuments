import * as React from 'react';
import { cn } from '@/lib/utils';

export function Badge({
  className,
  color,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium',
        !color && 'bg-surface text-ink',
        className,
      )}
      style={color ? { backgroundColor: color, color: '#fff' } : undefined}
      {...props}
    />
  );
}
