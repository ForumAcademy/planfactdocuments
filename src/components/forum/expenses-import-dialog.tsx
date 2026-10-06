'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import type { ParsedExpenses } from '@/lib/excel/expenses-excel';
import {
  autoExpenseCategory,
  expenseCategory,
  taskExpenseCategory,
  type ExpenseCategoryKey,
} from '@/lib/expenses';
import type { TaskDTO } from '@/lib/types';
import { cn, formatRub } from '@/lib/utils';
import { updateExpenses } from '@/server/actions/tasks';
import { useForum } from './forum-context';

interface Change {
  task: TaskDTO;
  rowNumber: number;
  cost?: number;
  /** Новое направление: ключ, null — автоматическое */
  category?: ExpenseCategoryKey | null;
  fromCategory: ExpenseCategoryKey;
  toCategory: ExpenseCategoryKey;
}

export function ExpensesImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { forum, tasks, lookups, mergeTasks } = useForum();
  const [parsed, setParsed] = React.useState<ParsedExpenses | null>(null);
  const [fileName, setFileName] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setParsed(null);
    setFileName(file.name);
    setLoading(true);
    try {
      const { parseExpensesWorkbook } = await import('@/lib/excel/expenses-excel');
      const p = await parseExpensesWorkbook(await file.arrayBuffer());
      if (!p.rows.length) setError(p.fileErrors.join('; ') || 'В файле не найдено строк задач');
      setParsed(p);
    } catch {
      setError('Не удалось прочитать файл. Нужен файл Excel в формате .xlsx.');
    } finally {
      setLoading(false);
    }
  };

  const analysis = React.useMemo(() => {
    if (!parsed) return null;
    const byNumber = new Map(tasks.map((t) => [t.number, t]));
    const changes: Change[] = [];
    const problems: { rowNumber: number; text: string }[] = [...parsed.skipped].map((s) => ({
      rowNumber: s.rowNumber,
      text: `нет № задачи — строка «${s.text}» пропущена`,
    }));
    for (const r of parsed.rows) {
      for (const e of r.errors) problems.push({ rowNumber: r.rowNumber, text: e });
      const task = byNumber.get(r.number);
      if (!task) {
        problems.push({ rowNumber: r.rowNumber, text: `в форуме нет задачи №${r.number}` });
        continue;
      }
      const block = task.blockId ? (lookups.block.get(task.blockId) ?? null) : null;
      const from = taskExpenseCategory(task, block);
      const c: Change = { task, rowNumber: r.rowNumber, fromCategory: from, toCategory: from };
      if (r.cost !== null && r.cost !== task.cost) c.cost = r.cost;
      if (r.category && r.category !== from) {
        c.category =
          r.category === autoExpenseCategory(task.description, block) ? null : r.category;
        c.toCategory = r.category;
      }
      if (c.cost !== undefined || c.category !== undefined) changes.push(c);
    }
    problems.sort((a, b) => a.rowNumber - b.rowNumber);
    const delta = changes.reduce((s, c) => s + (c.cost ?? c.task.cost) - c.task.cost, 0);
    return { changes, problems, delta };
  }, [parsed, tasks, lookups]);

  const submit = async () => {
    if (!analysis?.changes.length) return;
    setSaving(true);
    const res = await updateExpenses(
      forum.id,
      analysis.changes.map((c) => ({
        taskId: c.task.id,
        ...(c.cost !== undefined ? { cost: c.cost } : {}),
        ...(c.category !== undefined ? { expenseCategory: c.category } : {}),
      })),
    );
    setSaving(false);
    if (!res.ok) return void toast.error(res.error);
    mergeTasks(res.data);
    toast.success(`Расходы загружены: изменено задач ${res.data.length}`);
    onOpenChange(false);
  };

  const costChanges = analysis?.changes.filter((c) => c.cost !== undefined).length ?? 0;
  const catChanges = analysis?.changes.filter((c) => c.category !== undefined).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Загрузка линии расходов"
        description="Заполненный шаблон раздела: строки сопоставляются с задачами по «№ задачи»"
        wide
      >
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line p-4 hover:border-brand">
          <FileSpreadsheet className="size-6 text-brand" />
          <div className="text-sm">
            <div className="font-medium">{fileName || 'Выберите файл .xlsx'}</div>
            <div className="text-ink/60">
              Меняются только стоимость и направление задач. Пустая стоимость — без изменений.
            </div>
          </div>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            data-testid="expenses-import-file"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        {loading && <Spinner className="mt-3" label="Читаем файл…" />}
        {error && <p className="mt-3 text-sm text-status-red">{error}</p>}
        {parsed && parsed.fileErrors.length > 0 && parsed.rows.length > 0 && (
          <ul className="mt-3 list-inside list-disc text-sm text-yellow-700">
            {parsed.fileErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        {analysis && parsed && parsed.rows.length > 0 && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="expenses-summary">
              <Stat label="Строк задач в файле" value={String(parsed.rows.length)} />
              <Stat label="Изменится стоимость" value={String(costChanges)} tone="text-brand" />
              <Stat label="Сменится направление" value={String(catChanges)} tone="text-brand" />
              <Stat
                label="Итог расходов изменится на"
                value={`${analysis.delta > 0 ? '+' : ''}${formatRub(analysis.delta)}`}
                tone={analysis.delta ? 'text-ink' : 'text-status-gray'}
              />
            </div>

            {analysis.problems.length > 0 && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                {analysis.problems.slice(0, 20).map((p, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Строка {p.rowNumber}:{' '}
                    {p.text}
                  </div>
                ))}
                {analysis.problems.length > 20 && (
                  <div className="mt-1">…и ещё {analysis.problems.length - 20}</div>
                )}
              </div>
            )}

            {analysis.changes.length === 0 ? (
              <p className="text-sm text-ink/60">
                Изменений нет — данные в файле совпадают с форумом.
              </p>
            ) : (
              <div className="thin-scroll max-h-[40vh] overflow-auto rounded-md border border-line">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface text-left">
                    <tr>
                      <th className="px-2 py-1.5">№</th>
                      <th className="px-2 py-1.5">Задача</th>
                      <th className="px-2 py-1.5">Направление</th>
                      <th className="px-2 py-1.5 text-right">Было</th>
                      <th className="px-2 py-1.5 text-right">Станет</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.changes.map((c) => (
                      <tr key={c.task.id} className="border-t border-line align-top">
                        <td className="px-2 py-1 text-ink/60">{c.task.number}</td>
                        <td className="px-2 py-1">{c.task.description}</td>
                        <td className="whitespace-nowrap px-2 py-1">
                          {c.category !== undefined ? (
                            <>
                              <span className="text-ink/50 line-through">
                                {expenseCategory(c.fromCategory).label}
                              </span>{' '}
                              → {expenseCategory(c.toCategory).label}
                            </>
                          ) : (
                            <span className="text-ink/60">
                              {expenseCategory(c.fromCategory).label}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-ink/60">
                          {formatRub(c.task.cost)}
                        </td>
                        <td
                          className={cn(
                            'whitespace-nowrap px-2 py-1 text-right tabular-nums',
                            c.cost !== undefined && 'font-semibold',
                          )}
                        >
                          {formatRub(c.cost ?? c.task.cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={submit}
            disabled={!analysis?.changes.length || saving}
            data-testid="expenses-import-confirm"
          >
            {saving ? 'Загружаем…' : 'Применить изменения'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className={cn('text-xl font-semibold tabular-nums', tone)}>{value}</div>
      <div className="text-xs text-ink/60">{label}</div>
    </div>
  );
}
