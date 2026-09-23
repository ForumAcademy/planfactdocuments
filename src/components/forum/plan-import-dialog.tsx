'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import type { ParsedPlan, PlanRow } from '@/lib/excel/plan-excel';
import { computeTaskDates } from '@/lib/plan';
import { formatDate } from '@/lib/dates';
import { STATUS_LABEL } from '@/lib/status';
import { cn, pluralRu } from '@/lib/utils';
import { importPlan } from '@/server/actions/tasks';
import { useForum } from './forum-context';

const k = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

export function PlanImportButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="import-plan">
        <Upload /> Загрузить план
      </Button>
      {open && <PlanImportDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}

function PlanImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const { forum, tasks, dicts } = useForum();
  const [parsed, setParsed] = React.useState<ParsedPlan | null>(null);
  const [fileName, setFileName] = React.useState('');
  const [mode, setMode] = React.useState<'replace' | 'append'>(tasks.length ? 'append' : 'replace');
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
      const { parsePlanWorkbook } = await import('@/lib/excel/plan-excel');
      const p = await parsePlanWorkbook(await file.arrayBuffer());
      if (!p.rows.length) setError(p.fileErrors.join('; ') || 'В файле не найдено задач');
      setParsed(p);
    } catch {
      setError('Не удалось прочитать файл. Нужен файл Excel в формате .xlsx.');
    } finally {
      setLoading(false);
    }
  };

  const analysis = React.useMemo(() => {
    if (!parsed) return null;
    const rows = parsed.rows.filter((r) => r.description);
    const existingNumbers = new Set(tasks.map((t) => t.number));
    const stageByName = new Map(dicts.stages.map((s) => [k(s.name), s]));
    const known = {
      stage: new Set(dicts.stages.map((s) => k(s.name))),
      block: new Set(dicts.blocks.map((s) => k(s.name))),
      role: new Set(dicts.roles.map((s) => k(s.name))),
      emp: new Set(dicts.employees.map((s) => k(s.fullName))),
    };
    const newValues = {
      stage: new Map<string, string>(),
      block: new Map<string, string>(),
      role: new Map<string, string>(),
      emp: new Map<string, string>(),
    };
    const flagged = new Set<number>();
    const unknownTerm = new Set<number>();
    let updated = 0;
    for (const r of rows) {
      if (r.stage && !known.stage.has(k(r.stage))) newValues.stage.set(k(r.stage), r.stage);
      if (r.block && !known.block.has(k(r.block))) newValues.block.set(k(r.block), r.block);
      r.roles.forEach((x) => !known.role.has(k(x)) && newValues.role.set(k(x), x));
      r.employees.forEach((x) => !known.emp.has(k(x)) && newValues.emp.set(k(x), x));
      if (mode === 'append' && r.number !== null && existingNumbers.has(r.number)) updated++;
      if (r.errors.length) flagged.add(r.rowNumber);
      if (!(r.startDate && r.endDate)) {
        const st = stageByName.get(k(r.stage)) ?? (r.stage ? { name: r.stage, order: 0 } : null);
        const d = computeTaskDates(r.termText, st, forum);
        if (d.needsClarification) unknownTerm.add(r.rowNumber);
      }
    }
    return {
      rows,
      added: rows.length - updated,
      updated,
      newValues,
      flagged,
      unknownTerm,
      skipped: parsed.rows.length - rows.length,
    };
  }, [parsed, tasks, dicts, mode, forum]);

  const submit = async () => {
    if (!analysis) return;
    setSaving(true);
    const res = await importPlan(
      forum.id,
      analysis.rows.map((r) => ({
        number: r.number,
        stage: r.stage,
        block: r.block,
        description: r.description,
        termText: r.termText,
        roles: r.roles,
        status: r.status,
        comment: r.comment,
        employees: r.employees,
        startDate: r.startDate,
        endDate: r.endDate,
        completedAt: r.completedAt,
      })),
      mode,
    );
    setSaving(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`План загружен: добавлено ${res.data.added}, обновлено ${res.data.updated}`);
    onOpenChange(false);
    router.refresh();
  };

  const newCount = analysis
    ? analysis.newValues.stage.size +
      analysis.newValues.block.size +
      analysis.newValues.role.size +
      analysis.newValues.emp.size
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Загрузка плана из Excel"
        description="Формат — как в мастер-плане: лист «Мастер-план форума»"
        wide
      >
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line p-4 hover:border-brand">
          <FileSpreadsheet className="size-6 text-brand" />
          <div className="text-sm">
            <div className="font-medium">{fileName || 'Выберите файл .xlsx'}</div>
            <div className="text-ink/60">
              Столбцы: № · Этап · Блок / направление · Описание задачи · Срок · Роль · Статус ·
              Комментарий (+ Ответственный (ФИО), Дата начала, Дата окончания)
            </div>
          </div>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            data-testid="import-file"
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

        {analysis && analysis.rows.length > 0 && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  className="accent-brand"
                  checked={mode === 'append'}
                  onChange={() => setMode('append')}
                />
                <span>
                  <b>Добавить к плану</b> — строки с тем же № обновят существующие задачи
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  className="accent-brand"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />
                <span>
                  <b>Заменить план</b> — текущие {tasks.length}{' '}
                  {pluralRu(
                    tasks.length,
                    'задача будет удалена',
                    'задачи будут удалены',
                    'задач будут удалены',
                  )}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="import-summary">
              <Stat label="Строк в файле" value={analysis.rows.length} />
              <Stat label="Будет добавлено" value={analysis.added} tone="text-status-green" />
              <Stat label="Будет обновлено" value={analysis.updated} tone="text-brand" />
              <Stat
                label="Уточнить срок / ошибки"
                value={new Set([...analysis.flagged, ...analysis.unknownTerm]).size}
                tone="text-yellow-600"
              />
            </div>

            {newCount > 0 && (
              <div className="rounded-md border border-line bg-surface p-3 text-sm">
                <div className="mb-1 font-medium">
                  Новые значения будут добавлены в справочники:
                </div>
                {(
                  [
                    ['Этапы', analysis.newValues.stage],
                    ['Блоки', analysis.newValues.block],
                    ['Роли', analysis.newValues.role],
                    ['Сотрудники', analysis.newValues.emp],
                  ] as const
                ).map(([label, m]) =>
                  m.size ? (
                    <div key={label}>
                      <span className="text-ink/70">{label}:</span> {[...m.values()].join(', ')}
                    </div>
                  ) : null,
                )}
              </div>
            )}

            <div className="thin-scroll max-h-[40vh] overflow-auto rounded-md border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface text-left">
                  <tr>
                    <th className="px-2 py-1.5">Строка</th>
                    <th className="px-2 py-1.5">№</th>
                    <th className="px-2 py-1.5">Этап</th>
                    <th className="px-2 py-1.5">Задача</th>
                    <th className="px-2 py-1.5">Срок</th>
                    <th className="px-2 py-1.5">Даты</th>
                    <th className="px-2 py-1.5">Роль</th>
                    <th className="px-2 py-1.5">Статус</th>
                    <th className="px-2 py-1.5">Замечания</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.rows.map((r: PlanRow) => {
                    const warn =
                      analysis.flagged.has(r.rowNumber) || analysis.unknownTerm.has(r.rowNumber);
                    return (
                      <tr
                        key={r.rowNumber}
                        className={cn('border-t border-line align-top', warn && 'bg-yellow-50')}
                      >
                        <td className="px-2 py-1 text-ink/60">{r.rowNumber}</td>
                        <td className="px-2 py-1">{r.number}</td>
                        <td className="px-2 py-1">{r.stage}</td>
                        <td className="px-2 py-1">{r.description}</td>
                        <td className="px-2 py-1">{r.termText}</td>
                        <td className="whitespace-nowrap px-2 py-1">
                          {r.startDate || r.endDate
                            ? `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`
                            : ''}
                        </td>
                        <td className="px-2 py-1">{r.roles.join(' / ')}</td>
                        <td className="px-2 py-1">{STATUS_LABEL[r.status]}</td>
                        <td className="px-2 py-1 text-yellow-700">
                          {[
                            ...r.errors,
                            analysis.unknownTerm.has(r.rowNumber)
                              ? 'срок не распознан — «уточнить срок»'
                              : '',
                          ]
                            .filter(Boolean)
                            .map((e) => (
                              <div key={e} className="flex items-start gap-1">
                                <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {e}
                              </div>
                            ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={submit}
            disabled={!analysis?.rows.length || saving}
            data-testid="import-confirm"
          >
            {saving ? 'Загружаем…' : mode === 'replace' ? 'Заменить план' : 'Добавить к плану'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className={cn('text-xl font-semibold', tone)}>{value}</div>
      <div className="text-xs text-ink/60">{label}</div>
    </div>
  );
}
