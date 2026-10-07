'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Download, Plus, Search, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { NumberCell } from '@/components/ui/number-cell';
import { Spinner } from '@/components/ui/spinner';
import { downloadBlob, safeFileName } from '@/lib/download';
import type { ParsedFunnel } from '@/lib/excel/funnel-excel';
import {
  DEAL_STAGES,
  DEAL_STATUSES,
  daysInStage,
  isStale,
  statusLabel,
  sumAmount,
  type DealStageKey,
  type DealStatus,
  type DealValue,
} from '@/lib/funnel';
import type { IncomeItemValue } from '@/lib/income';
import { cn, formatRub, pluralRu } from '@/lib/utils';
import { createDeal, deleteDeal, importDeals, updateDeal } from '@/server/actions/funnel';
import { useForum } from './forum-context';

type DealPatch = Partial<
  Pick<
    DealValue,
    | 'company'
    | 'source'
    | 'manager'
    | 'enteredAt'
    | 'incomeKey'
    | 'qty'
    | 'amount'
    | 'status'
    | 'lostStage'
    | 'decisionDate'
    | 'paidDate'
    | 'comment'
  >
>;

const STATUS_STYLE: Record<DealStatus, string> = {
  qualification: 'bg-[#5B6BD6]/10 text-[#3F4CB0]',
  negotiation: 'bg-[#3F7FD0]/10 text-[#2A64AE]',
  agreement: 'bg-[#2B95B5]/10 text-[#1E7590]',
  invoice: 'bg-[#22A58C]/10 text-[#16806B]',
  paid: 'bg-status-green/15 text-status-green',
  refused: 'bg-status-red/10 text-status-red',
};

export function DealsTable({
  deals,
  setDeals,
  items,
  directionLabel,
}: {
  deals: DealValue[];
  setDeals: React.Dispatch<React.SetStateAction<DealValue[]>>;
  items: IncomeItemValue[];
  directionLabel: (key: string | null) => string;
}) {
  const { forum, today } = useForum();
  const confirm = useConfirm();
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<DealStatus | ''>('');
  const [source, setSource] = React.useState('');
  const [manager, setManager] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newCompany, setNewCompany] = React.useState('');
  const [importOpen, setImportOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = React.useState<ParsedFunnel | null>(null);

  const uniq = (f: (d: DealValue) => string) =>
    [...new Set(deals.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const sources = uniq((d) => d.source);
  const managers = uniq((d) => d.manager);
  const directions = items.filter((i) => !i.factOnly);

  const q = query.trim().toLowerCase();
  const shown = deals.filter(
    (d) =>
      (!status || d.status === status) &&
      (!source || d.source === source) &&
      (!manager || d.manager === manager) &&
      (!q ||
        d.company.toLowerCase().includes(q) ||
        d.comment.toLowerCase().includes(q) ||
        d.source.toLowerCase().includes(q)),
  );
  const counts = new Map<string, number>();
  for (const d of deals) counts.set(d.status, (counts.get(d.status) ?? 0) + 1);

  const save = async (d: DealValue, patch: DealPatch) => {
    const prev = deals;
    setDeals((list) => list.map((x) => (x.id === d.id ? { ...x, ...patch } : x)));
    setSaving(true);
    const res = await updateDeal(forum.id, d.id, patch);
    setSaving(false);
    if (res.ok) setDeals((list) => list.map((x) => (x.id === d.id ? res.data : x)));
    else {
      setDeals(prev);
      toast.error(res.error);
    }
  };

  const add = async () => {
    const company = newCompany.trim();
    if (!company) return;
    setSaving(true);
    const res = await createDeal(forum.id, {
      company,
      ...(source ? { source } : {}),
      ...(manager ? { manager } : {}),
      ...(status ? { status } : {}),
    });
    setSaving(false);
    if (res.ok) {
      setDeals((list) => [...list, res.data]);
      setNewCompany('');
      setAdding(false);
      setQuery('');
    } else toast.error(res.error);
  };

  const remove = async (d: DealValue) => {
    const ok = await confirm({
      title: `Удалить сделку «${d.company}»?`,
      description: 'Сделка исчезнет из воронки. Факт доходов не изменится.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    const res = await deleteDeal(forum.id, d.id);
    if (res.ok) setDeals((list) => list.filter((x) => x.id !== d.id));
    else toast.error(res.error);
  };

  const exportXlsx = async () => {
    const { buildFunnelWorkbook } = await import('@/lib/excel/funnel-excel');
    const blob = await buildFunnelWorkbook(shown, directionLabel);
    downloadBlob(blob, `${safeFileName(forum.name)} — воронка.xlsx`);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { parseFunnelWorkbook } = await import('@/lib/excel/funnel-excel');
      const p = await parseFunnelWorkbook(await file.arrayBuffer());
      if (!p.deals.length) {
        toast.error('В файле не найден лист со столбцами «Компания» и «Статус»');
        return;
      }
      setParsed(p);
      setImportOpen(true);
    } catch {
      toast.error('Не удалось прочитать файл. Нужен файл Excel в формате .xlsx.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /** Направление из файла → позиция доходов; билеты без направления — «Участник» */
  const matchDirection = (name: string, qty: number): string | null => {
    const n = name.trim().toLowerCase();
    const hit = n ? directions.find((i) => i.label.toLowerCase() === n) : undefined;
    if (hit) return hit.key;
    if (!qty) return null;
    return (
      directions.find((i) => i.key === 'participant')?.key ??
      directions.find((i) => i.group === 'tickets')?.key ??
      null
    );
  };

  const runImport = async () => {
    if (!parsed) return;
    setSaving(true);
    const res = await importDeals(
      forum.id,
      parsed.deals.map((d) => ({
        company: d.company,
        source: d.source,
        manager: d.manager,
        enteredAt: d.enteredAt,
        incomeKey: matchDirection(d.direction, d.qty),
        qty: d.qty,
        amount: d.amount,
        status: d.status,
        lostStage: d.lostStage,
        decisionDate: d.decisionDate,
        paidDate: d.paidDate,
        comment: d.comment,
      })),
    );
    setSaving(false);
    if (res.ok) {
      setDeals(res.data.deals);
      setImportOpen(false);
      setParsed(null);
      toast.success(`Загружено: новых ${res.data.added}, обновлено ${res.data.updated}`);
    } else toast.error(res.error);
  };

  const norm = (c: string) =>
    c
      .toLowerCase()
      .replace(/[«»"'`“”]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  // Сколько строк файла обновят существующие сделки: n-я строка компании — её n-я сделка
  const willUpdate = React.useMemo(() => {
    if (!parsed) return 0;
    const left = new Map<string, number>();
    for (const d of deals) left.set(norm(d.company), (left.get(norm(d.company)) ?? 0) + 1);
    let n = 0;
    for (const d of parsed.deals) {
      const k = norm(d.company);
      const c = left.get(k) ?? 0;
      if (c > 0) {
        n++;
        left.set(k, c - 1);
      }
    }
    return n;
  }, [parsed, deals]);

  return (
    <div className="mt-4" data-testid="deals-table">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-ink/40" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Компания, источник, комментарий"
            className="h-8 w-64 pl-8 text-sm"
            data-testid="deals-search"
          />
        </div>
        <Select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="h-8 w-auto min-w-40 text-sm"
          aria-label="Откуда пришёл"
        >
          <option value="">Все источники</option>
          {sources.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select
          value={manager}
          onChange={(e) => setManager(e.target.value)}
          className="h-8 w-auto min-w-40 text-sm"
          aria-label="Кто ведёт"
        >
          <option value="">Все менеджеры</option>
          {managers.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        {saving && <Spinner className="text-xs" label="Сохраняем…" />}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" />
            Загрузить из Excel
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
            data-testid="deals-import-file"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void exportXlsx()}
            disabled={!deals.length}
          >
            <Download className="size-4" />
            Выгрузить в Excel
          </Button>
          <Button size="sm" onClick={() => setAdding(true)} data-testid="deals-add">
            <Plus className="size-4" />
            Добавить сделку
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Статус">
        <StatusChip active={!status} onClick={() => setStatus('')}>
          Все · {deals.length}
        </StatusChip>
        {DEAL_STATUSES.map((s) => (
          <StatusChip
            key={s.key}
            active={status === s.key}
            onClick={() => setStatus(status === s.key ? '' : s.key)}
            color={s.color}
          >
            {s.label} · {counts.get(s.key) ?? 0}
          </StatusChip>
        ))}
        <span className="ml-auto self-center text-sm text-ink/60">
          Показано {shown.length} · {formatRub(sumAmount(shown))}
        </span>
      </div>

      <div className="thin-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[1400px] text-sm">
          <thead className="bg-surface text-xs text-ink/60">
            <tr>
              <th className="w-8 px-2 py-2 text-right font-medium">№</th>
              <th className="min-w-[240px] px-2 py-2 text-left font-medium">Компания</th>
              <th className="px-2 py-2 text-left font-medium">Откуда пришёл</th>
              <th className="px-2 py-2 text-left font-medium">Дата входа</th>
              <th className="px-2 py-2 text-left font-medium">Направление</th>
              <th className="w-16 px-2 py-2 text-right font-medium">Шт.</th>
              <th className="w-28 px-2 py-2 text-right font-medium">Сумма</th>
              <th className="px-2 py-2 text-left font-medium">Статус</th>
              <th className="px-2 py-2 text-left font-medium">Дата решения</th>
              <th className="px-2 py-2 text-left font-medium">Дата оплаты</th>
              <th className="px-2 py-2 text-left font-medium">Кто ведёт</th>
              <th className="min-w-[180px] px-2 py-2 text-left font-medium">Комментарий</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr className="border-t border-line bg-brand-light/40">
                <td />
                <td className="px-2 py-1.5" colSpan={12}>
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={newCompany}
                      onChange={(e) => setNewCompany(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void add();
                        if (e.key === 'Escape') setAdding(false);
                      }}
                      placeholder="Название компании"
                      className="h-8 w-80"
                      data-testid="deals-new-company"
                    />
                    <Button size="sm" onClick={() => void add()} disabled={!newCompany.trim()}>
                      Добавить
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                      Отмена
                    </Button>
                    <span className="text-xs text-ink/50">
                      Остальное заполните в строке: этап, сумму, источник
                    </span>
                  </div>
                </td>
              </tr>
            )}
            {shown.map((d, idx) => {
              const stale = isStale(d, today);
              const days = daysInStage(d, today);
              return (
                <tr
                  key={d.id}
                  className="group border-t border-line hover:bg-surface/50"
                  data-testid="deal-row"
                >
                  <td className="px-2 py-1 text-right text-xs text-ink/40">{idx + 1}</td>
                  <td className="px-1 py-1">
                    <TextCell
                      value={d.company}
                      onCommit={(v) => v && save(d, { company: v })}
                      required
                    />
                  </td>
                  <td className="px-1 py-1">
                    <TextCell
                      value={d.source}
                      onCommit={(v) => save(d, { source: v })}
                      list="deal-sources"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <DateCell value={d.enteredAt} onCommit={(v) => save(d, { enteredAt: v })} />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      value={d.incomeKey ?? ''}
                      onChange={(e) => save(d, { incomeKey: e.target.value || null })}
                      className="h-7 w-[150px] rounded border border-transparent bg-transparent px-1 text-sm hover:border-line focus:border-brand focus:outline-none"
                      aria-label="Направление дохода"
                    >
                      <option value="">—</option>
                      {directions.map((i) => (
                        <option key={i.key} value={i.key}>
                          {i.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <NumberCell
                      value={d.qty}
                      format={(n) => (n ? String(n) : '—')}
                      label="Количество"
                      onCommit={(n) => save(d, { qty: n })}
                      testId={`deal-qty-${d.id}`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <NumberCell
                      value={d.amount}
                      format={(n) => (n ? formatRub(n) : '—')}
                      label="Сумма"
                      onCommit={(n) => save(d, { amount: n })}
                      testId={`deal-amount-${d.id}`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <div className="flex flex-col gap-0.5">
                      <select
                        value={d.status}
                        onChange={(e) => save(d, { status: e.target.value as DealStatus })}
                        className={cn(
                          'h-7 w-[150px] cursor-pointer rounded border-0 px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand/30',
                          STATUS_STYLE[d.status],
                        )}
                        aria-label="Статус"
                        data-testid={`deal-status-${d.id}`}
                      >
                        {DEAL_STATUSES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      {d.status === 'refused' ? (
                        <select
                          value={d.lostStage ?? ''}
                          onChange={(e) =>
                            save(d, { lostStage: (e.target.value || null) as DealStageKey | null })
                          }
                          className="h-6 w-[160px] rounded border border-transparent bg-transparent px-1 text-xs text-ink/60 hover:border-line focus:outline-none"
                          aria-label="На каком этапе отказ"
                        >
                          <option value="">этап отказа?</option>
                          {DEAL_STAGES.filter((s) => s.key !== 'paid').map((s) => (
                            <option key={s.key} value={s.key}>
                              этап: {s.label}
                            </option>
                          ))}
                        </select>
                      ) : d.status !== 'paid' && days !== null ? (
                        <span
                          className={cn('px-2 text-xs', stale ? 'text-amber-700' : 'text-ink/40')}
                        >
                          {days} {pluralRu(days, 'день', 'дня', 'дней')} на этапе
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-1 py-1">
                    <DateCell
                      value={d.decisionDate}
                      onCommit={(v) => save(d, { decisionDate: v })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <DateCell value={d.paidDate} onCommit={(v) => save(d, { paidDate: v })} />
                  </td>
                  <td className="px-1 py-1">
                    <TextCell
                      value={d.manager}
                      onCommit={(v) => save(d, { manager: v })}
                      list="deal-managers"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <TextCell value={d.comment} onCommit={(v) => save(d, { comment: v })} />
                  </td>
                  <td className="px-1 py-1">
                    <button
                      type="button"
                      onClick={() => void remove(d)}
                      className="rounded p-1 text-ink/30 opacity-0 hover:bg-status-red/10 hover:text-status-red group-hover:opacity-100"
                      title="Удалить сделку"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-ink/50">
                  {deals.length ? 'Ничего не найдено' : 'Сделок пока нет'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <datalist id="deal-sources">
        {sources.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="deal-managers">
        {managers.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent title="Загрузка воронки из Excel" className="max-w-lg">
          {parsed && (
            <div className="space-y-2 text-sm">
              <p>
                Лист «{parsed.sheetName}»: {parsed.deals.length}{' '}
                {pluralRu(parsed.deals.length, 'сделка', 'сделки', 'сделок')}.
              </p>
              <ul className="list-disc pl-5 text-ink/80">
                <li>новых — {parsed.deals.length - willUpdate}</li>
                <li>обновятся (та же компания) — {willUpdate}</li>
                {DEAL_STATUSES.map((s) => {
                  const n = parsed.deals.filter((d) => d.status === s.key).length;
                  return n ? (
                    <li key={s.key}>
                      {statusLabel(s.key)} — {n}
                    </li>
                  ) : null;
                })}
              </ul>
              {parsed.skipped.length > 0 && (
                <p className="text-amber-700">
                  Пропущено строк: {parsed.skipped.length} (
                  {parsed.skipped
                    .slice(0, 3)
                    .map((s) => `стр. ${s.rowNumber}: ${s.text}`)
                    .join('; ')}
                  )
                </p>
              )}
              <p className="text-xs text-ink/50">
                Сделки, которых нет в файле, останутся как есть. Отказ без указанного этапа
                считается отказом на «Переговорах», если у сделки есть сумма, иначе — на
                «Квалификации».
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Отмена
            </Button>
            <Button onClick={() => void runImport()} disabled={saving}>
              {saving ? 'Загружаем…' : 'Загрузить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusChip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition',
        active
          ? 'border-brand bg-brand text-white'
          : 'border-line bg-white text-ink/80 hover:border-brand/40',
      )}
    >
      {color && (
        <span className="size-2 rounded-full" style={{ background: active ? '#fff' : color }} />
      )}
      {children}
    </button>
  );
}

/** Текст, редактируемый по клику */
function TextCell({
  value,
  onCommit,
  required,
  list,
}: {
  value: string;
  onCommit: (v: string) => void;
  required?: boolean;
  list?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (required && !v) return;
    if (v !== value) onCommit(v);
  };
  if (editing)
    return (
      <input
        autoFocus
        value={draft}
        list={list}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="h-7 w-full rounded border border-brand bg-white px-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
    );
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={cn(
        'block min-h-7 w-full max-w-[320px] truncate rounded px-1.5 py-1 text-left hover:bg-brand-light',
        !value && 'text-status-gray',
      )}
      title={value || 'Изменить'}
    >
      {value || '—'}
    </button>
  );
}

function DateCell({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
}) {
  const [draft, setDraft] = React.useState(value ?? '');
  React.useEffect(() => setDraft(value ?? ''), [value]);
  const commit = () => {
    const v = draft || null;
    if (v !== value) onCommit(v);
  };
  return (
    <input
      type="date"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      className={cn(
        'h-7 w-[132px] rounded border border-transparent bg-transparent px-1 text-sm hover:border-line focus:border-brand focus:outline-none',
        // Пустая дата не мозолит глаза маской «дд.мм.гггг» — видна при наведении
        !draft && 'text-transparent hover:text-status-gray focus:text-ink',
      )}
    />
  );
}
