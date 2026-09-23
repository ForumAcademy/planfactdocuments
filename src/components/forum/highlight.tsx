import { normalizeSearch } from '@/lib/filters';

/** Подсвечивает найденный текст (без учёта регистра). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = normalizeSearch(query);
  if (!q) return <>{text}</>;
  const hay = text.toLowerCase().replace(/ё/g, 'е');
  const parts: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const j = hay.indexOf(q, i);
    if (j === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (j > i) parts.push(text.slice(i, j));
    parts.push(<mark key={k++}>{text.slice(j, j + q.length)}</mark>);
    i = j + q.length;
  }
  return <>{parts}</>;
}
