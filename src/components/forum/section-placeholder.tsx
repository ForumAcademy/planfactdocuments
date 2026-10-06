import type { LucideIcon } from 'lucide-react';

/** Заглушка для подраздела форума, который ещё в разработке */
export function SectionPlaceholder({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-white px-6 py-16 text-center">
        <Icon className="size-8 text-ink/40" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-ink/60">{description}</p>
        <span className="rounded-full bg-surface px-3 py-1 text-xs text-ink/60">
          Раздел в разработке
        </span>
      </div>
    </div>
  );
}
