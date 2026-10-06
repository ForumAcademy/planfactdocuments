'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  FileSpreadsheet,
  FolderInput,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NumberCell } from '@/components/ui/number-cell';
import { StatusBadge } from '@/components/ui/status-badge';
import { todayMsk } from '@/lib/dates';
import { downloadBlob, safeFileName } from '@/lib/download';
import {
  EXPENSE_CATEGORIES,
  autoExpenseCategory,
  expenseCategory,
  groupExpenses,
  isExpenseCategory,
  type ExpenseCategoryKey,
  type ExpenseGroup,
} from '@/lib/expenses';
import type { TaskDTO } from '@/lib/types';
import { cn, formatRub, pluralRu } from '@/lib/utils';
import { setExpenseLimit } from '@/server/actions/forums';
import { CostCell } from './cells';
import { ExpensesImportDialog } from './expenses-import-dialog';
import { useForum } from './forum-context';

const pct = (part: number, total: number) =>
  total ? `${((part / total) * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%` : '—';

export function ExpensesView() {
  const { forum, tasks, lookups } = useForum();
  const [showEmpty, setShowEmpty] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const blockOf = React.useCallback(
    (t: TaskDTO) => (t.blockId ? (lookups.block.get(t.blockId) ?? null) : null),
    [lookups],
  );
  const { groups, total } = React.useMemo(() => {
    const ordered = [...tasks].sort((a, b) => b.cost - a.cost || a.order - b.order);
    return groupExpenses(ordered, blockOf);
  }, [tasks, blockOf]);
  const withCost = tasks.filter((t) => t.cost > 0).length;
  const [limit, setLimit] = React.useState(forum.expenseLimit);
  React.useEffect(() => setLimit(forum.expenseLimit), [forum.expenseLimit]);
  const overLimit = limit != null && total > limit;

  const saveLimit = async (v: number) => {
    const next = v || null;
    const prev = limit;
    setLimit(next);
    const res = await setExpenseLimit(forum.id, next);
    if (!res.ok) {
      setLimit(prev);
      toast.error(res.error);
    }
  };

  const toggle = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const allOpen = groups.every((g) => expanded.has(g.category.key));

  const exportFile = async (mode: 'template' | 'data') => {
    setBusy(true);
    try {
      const { buildExpensesWorkbook } = await import('@/lib/excel/expenses-excel');
      const date = todayMsk();
      const buf = await buildExpensesWorkbook(
        groups.map((g) => ({
          key: g.category.key,
          label: g.category.label,
          color: g.category.color,
          rows: [...g.tasks]
            .sort((a, b) => a.order - b.order)
            .map((t) => ({
              number: t.number,
              description: t.description,
              stage: t.stageId ? (lookups.stage.get(t.stageId)?.name ?? '') : '',
              status: t.status,
              cost: t.cost,
            })),
        })),
        { forumName: forum.name, mode, date },
      );
      downloadBlob(
        new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `${safeFileName(forum.name)} — ${mode === 'template' ? 'шаблон расходов' : 'расходы'} ${date}.xlsx`,
      );
    } catch (e) {
      console.error(e);
      toast.error('Не удалось сформировать файл');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4" data-testid="expenses-view">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div className="text-xs text-ink/60">Расходы форума по задачам</div>
          <div
            className={cn('text-2xl font-semibold tabular-nums', overLimit && 'text-status-red')}
            data-testid="expenses-total"
            data-over-limit={overLimit || undefined}
          >
            {formatRub(total)}
          </div>
          <div className="text-xs text-ink/60">
            {withCost} {pluralRu(withCost, 'статья', 'статьи', 'статей')} со стоимостью из{' '}
            {tasks.length} {pluralRu(tasks.length, 'задачи', 'задач', 'задач')}
          </div>
        </div>
        <div className="min-w-[220px]" data-testid="expenses-limit-block">
          <div className="text-xs text-ink/60">Предельно допустимые расходы</div>
          <NumberCell
            value={limit ?? 0}
            format={(v) => (v ? formatRub(v) : 'Не задан')}
            label="Предельно допустимые расходы, ₽"
            onCommit={(v) => void saveLimit(v)}
            testId="expenses-limit"
            className="-ml-1 w-auto text-left text-2xl font-semibold"
            inputClassName="h-8 w-48 text-left text-lg"
          />
          {limit ? (
            <>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                <div
                  className={cn('h-full', overLimit ? 'bg-status-red' : 'bg-status-green')}
                  style={{ width: `${Math.min(100, (total / limit) * 100)}%` }}
                />
              </div>
              <div className={cn('mt-0.5 text-xs', overLimit ? 'text-status-red' : 'text-ink/60')}>
                {overLimit
                  ? `Превышение на ${formatRub(total - limit)}`
                  : `Остаток ${formatRub(limit - total)} · ${pct(total, limit)} лимита`}
              </div>
            </>
          ) : (
            <div className="text-xs text-ink/60">Нажмите, чтобы задать</div>
          )}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => exportFile('template')}
            disabled={busy}
            title="Все задачи форума по направлениям с пустой стоимостью — заполнить и загрузить"
            data-testid="expenses-template"
          >
            <FileSpreadsheet /> Шаблон
          </Button>
          <Button
            variant="outline"
            onClick={() => exportFile('data')}
            disabled={busy}
            data-testid="expenses-export"
          >
            <Download /> Выгрузить
          </Button>
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            data-testid="expenses-import"
          >
            <Upload /> Загрузить
          </Button>
        </div>
      </div>

      {total > 0 && (
        <div className="mt-4">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface">
            {groups
              .filter((g) => g.total > 0)
              .map((g) => (
                <div
                  key={g.category.key}
                  style={{ width: `${(g.total / total) * 100}%`, background: g.category.color }}
                  title={`${g.category.label}: ${formatRub(g.total)} (${pct(g.total, total)})`}
                />
              ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/70">
            {groups
              .filter((g) => g.total > 0)
              .map((g) => (
                <span key={g.category.key} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: g.category.color }} />
                  {g.category.label} · {pct(g.total, total)}
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <button
          type="button"
          onClick={() =>
            setExpanded(allOpen ? new Set() : new Set(groups.map((g) => g.category.key)))
          }
          className="inline-flex items-center gap-1 text-brand hover:underline"
        >
          {allOpen ? <ChevronsDownUp className="size-4" /> : <ChevronsUpDown className="size-4" />}
          {allOpen ? 'Свернуть все' : 'Развернуть все'}
        </button>
        <label className="inline-flex items-center gap-2 text-ink/80">
          <input
            type="checkbox"
            className="accent-brand"
            checked={showEmpty}
            onChange={(e) => setShowEmpty(e.target.checked)}
            data-testid="expenses-show-empty"
          />
          Показывать задачи без стоимости
        </label>
      </div>

      <div className="thin-scroll mt-2 overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface text-left text-xs text-ink/70">
            <tr>
              <th className="px-3 py-2 font-medium">Направление / статья расходов</th>
              <th className="w-14 px-2 py-2 font-medium">№</th>
              <th className="w-48 px-2 py-2 font-medium">Этап</th>
              <th className="w-32 px-2 py-2 font-medium">Статус</th>
              <th className="w-36 px-2 py-2 text-right font-medium">Стоимость</th>
              <th className="w-20 px-3 py-2 text-right font-medium">Доля</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <GroupRows
              key={g.category.key}
              group={g}
              total={total}
              open={expanded.has(g.category.key)}
              onToggle={() => toggle(g.category.key)}
              showEmpty={showEmpty}
            />
          ))}
          <tfoot>
            <tr className="border-t-2 border-brand/40 font-semibold">
              <td className="px-3 py-2.5" colSpan={4}>
                Итого
              </td>
              <td
                className={cn(
                  'px-2 py-2.5 text-right tabular-nums',
                  overLimit && 'text-status-red',
                )}
              >
                {formatRub(total)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{total ? '100%' : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {total === 0 && (
        <p className="mt-3 text-sm text-ink/60">
          Стоимость задач пока не заполнена. Укажите её во вкладке «План» → «Этапы и задачи»
          (столбец «Стоимость») или скачайте шаблон, заполните и загрузите его здесь.
        </p>
      )}

      {importOpen && <ExpensesImportDialog open={importOpen} onOpenChange={setImportOpen} />}
    </div>
  );
}

function GroupRows({
  group: g,
  total,
  open,
  onToggle,
  showEmpty,
}: {
  group: ExpenseGroup<TaskDTO>;
  total: number;
  open: boolean;
  onToggle: () => void;
  showEmpty: boolean;
}) {
  const rows = showEmpty ? g.tasks : g.tasks.filter((t) => t.cost > 0);
  const priced = g.tasks.filter((t) => t.cost > 0).length;
  return (
    <tbody data-testid={`expense-group-${g.category.key}`}>
      <tr
        className="cursor-pointer border-t border-line hover:bg-surface/60"
        onClick={onToggle}
        aria-expanded={open}
      >
        <td className="px-3 py-2.5" colSpan={4}>
          <div className="flex items-center gap-2">
            {open ? (
              <ChevronDown className="size-4 shrink-0" />
            ) : (
              <ChevronRight className="size-4 shrink-0" />
            )}
            <span
              className="h-4 w-1.5 shrink-0 rounded-sm"
              style={{ background: g.category.color }}
            />
            <span className="font-semibold">{g.category.label}</span>
            <span className="text-xs text-ink/60">
              {priced} {pluralRu(priced, 'статья', 'статьи', 'статей')}
            </span>
            <span className="hidden truncate text-xs text-ink/50 lg:inline">{g.category.hint}</span>
          </div>
        </td>
        <td
          className={cn(
            'px-2 py-2.5 text-right font-semibold tabular-nums',
            !g.total && 'text-status-gray',
          )}
        >
          {formatRub(g.total)}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-ink/70">{pct(g.total, total)}</td>
      </tr>
      {open && rows.length === 0 && (
        <tr className="border-t border-line/60">
          <td colSpan={6} className="py-2 pl-12 pr-3 text-xs text-status-gray">
            {g.tasks.length
              ? 'Нет задач со стоимостью — включите «Показывать задачи без стоимости»'
              : 'Нет задач в этом направлении'}
          </td>
        </tr>
      )}
      {open && rows.map((t) => <ItemRow key={t.id} task={t} total={total} />)}
    </tbody>
  );
}

function ItemRow({ task: t, total }: { task: TaskDTO; total: number }) {
  const { lookups, today, setOpenTaskId } = useForum();
  const stage = t.stageId ? lookups.stage.get(t.stageId) : undefined;
  return (
    <tr className="group border-t border-line/60 align-top" data-testid="expense-row">
      <td className="py-1.5 pl-12 pr-3">
        <div className="flex items-start gap-1">
          <button
            type="button"
            onClick={() => setOpenTaskId(t.id)}
            className="text-left hover:text-brand hover:underline"
            title="Открыть задачу"
          >
            {t.description}
          </button>
          <CategoryMenu task={t} />
        </div>
      </td>
      <td className="px-2 py-1.5 tabular-nums text-ink/60">{t.number}</td>
      <td className="px-2 py-1.5 text-xs text-ink/70">
        {stage && (
          <span className="inline-flex items-start gap-1.5">
            <span
              className="mt-1 size-2 shrink-0 rounded-full"
              style={{ background: stage.color }}
            />
            {stage.name}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <StatusBadge task={t} today={today} />
      </td>
      <td className="px-1 py-1">
        <CostCell task={t} />
      </td>
      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-ink/60">
        {t.cost ? pct(t.cost, total) : ''}
      </td>
    </tr>
  );
}

/** Перенос задачи в другое направление расходов */
function CategoryMenu({ task: t }: { task: TaskDTO }) {
  const { lookups, patchTask } = useForum();
  const block = t.blockId ? (lookups.block.get(t.blockId) ?? null) : null;
  const auto = autoExpenseCategory(t.description, block);
  const manual = isExpenseCategory(t.expenseCategory) ? t.expenseCategory : null;
  const set = (key: ExpenseCategoryKey | null) => {
    const next = key === auto ? null : key;
    if (next !== t.expenseCategory) void patchTask(t.id, { expenseCategory: next });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="mt-0.5 shrink-0 rounded p-0.5 text-ink/40 opacity-60 hover:bg-surface hover:text-brand group-hover:opacity-100"
          title="Перенести в другое направление"
          aria-label="Перенести в другое направление"
          data-testid="expense-move"
        >
          <FolderInput className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[260px]">
        <div className="px-2 py-1 text-xs text-ink/60">Направление расходов</div>
        {EXPENSE_CATEGORIES.map((c) => {
          const current = (manual ?? auto) === c.key;
          return (
            <DropdownMenuItem key={c.key} onSelect={() => set(c.key)}>
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
              <span className={cn(current && 'font-semibold')}>{c.label}</span>
              {c.key === auto && <span className="ml-auto text-xs text-ink/50">авто</span>}
            </DropdownMenuItem>
          );
        })}
        {manual && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => set(null)}>
              Вернуть автоматически ({expenseCategory(auto).label})
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
