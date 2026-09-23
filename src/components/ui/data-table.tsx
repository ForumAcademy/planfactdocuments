'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  label: string;
  className?: string;
  sortValue?: (row: T) => string | number | null;
  render: (row: T) => React.ReactNode;
}

/** Таблица справочника: поиск и сортировка по клику на заголовок. */
export function DataTable<T extends { id: number }>({
  rows,
  columns,
  searchText,
  toolbar,
  onRowClick,
  rowClassName,
  initialSort,
  emptyText = 'Записей нет',
}: {
  rows: T[];
  columns: Column<T>[];
  searchText: (row: T) => string;
  toolbar?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  emptyText?: string;
}) {
  const [q, setQ] = React.useState('');
  const [sort, setSort] = React.useState(initialSort ?? null);

  const view = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = s ? rows.filter((r) => searchText(r).toLowerCase().includes(s)) : rows;
    const col = sort && columns.find((c) => c.key === sort.key);
    if (col?.sortValue) {
      const dir = sort!.dir === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => {
        const va = col.sortValue!(a);
        const vb = col.sortValue!(b);
        if (va === vb) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return (
          (typeof va === 'number' && typeof vb === 'number'
            ? va - vb
            : String(va).localeCompare(String(vb), 'ru')) * dir
        );
      });
    }
    return list;
  }, [rows, q, sort, columns, searchText]);

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' },
    );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-status-gray" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск…"
            className="h-9 w-full rounded-md border border-line pl-8 pr-3 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <span className="text-sm text-status-gray">Записей: {view.length}</span>
        <div className="ml-auto flex flex-wrap gap-2">{toolbar}</div>
      </div>
      <div className="thin-scroll overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs text-ink/70">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn('whitespace-nowrap px-3 py-2 font-medium', c.className)}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-brand"
                      onClick={() => toggleSort(c.key)}
                    >
                      {c.label}
                      {sort?.key === c.key ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-status-gray">
                  {emptyText}
                </td>
              </tr>
            )}
            {view.map((r) => (
              <tr
                key={r.id}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn(
                  'border-t border-line align-top',
                  onRowClick && 'cursor-pointer hover:bg-surface/70',
                  rowClassName?.(r),
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-3 py-2', c.className)}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
