import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Страница не найдена</h1>
      <Link href="/" className="mt-4 inline-block text-brand hover:underline">
        На главную
      </Link>
    </div>
  );
}
