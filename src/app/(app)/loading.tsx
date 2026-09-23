import { Spinner } from '@/components/ui/spinner';

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2">
      <Spinner label="Загружаем данные…" />
      <p className="text-xs text-status-gray">
        Первый запрос после паузы может занять несколько секунд
      </p>
    </div>
  );
}
