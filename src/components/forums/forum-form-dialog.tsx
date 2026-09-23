'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { addMonths } from '@/lib/dates';
import type { ForumDTO } from '@/lib/types';
import { fieldErrors, forumSchema } from '@/lib/validation';
import { createForum, recalcDates, updateForum, type PlanSource } from '@/server/actions/forums';
import type { PlanRowInput } from '@/server/plan-service';
import { pluralRu } from '@/lib/utils';

type SourceKind = 'empty' | 'template' | 'forum' | 'excel';

export function ForumFormDialog({
  open,
  onOpenChange,
  forum,
  forumOptions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  forum?: ForumDTO;
  forumOptions: { id: number; name: string }[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const isEdit = Boolean(forum);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [salesStartDate, setSalesStartDate] = useState('');
  const [salesTouched, setSalesTouched] = useState(false);
  const [location, setLocation] = useState('');
  const [source, setSource] = useState<SourceKind>('template');
  const [copyFrom, setCopyFrom] = useState<string>('');
  const [excelRows, setExcelRows] = useState<PlanRowInput[] | null>(null);
  const [excelInfo, setExcelInfo] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(forum?.name ?? '');
    setStartDate(forum?.startDate ?? '');
    setEndDate(forum?.endDate ?? '');
    setSalesStartDate(forum?.salesStartDate ?? '');
    setSalesTouched(Boolean(forum));
    setLocation(forum?.location ?? '');
    setSource('template');
    setCopyFrom('');
    setExcelRows(null);
    setExcelInfo('');
    setErrors({});
  }, [open, forum]);

  const onStartChange = (v: string) => {
    setStartDate(v);
    if (!salesTouched && v) setSalesStartDate(addMonths(v, -4));
  };

  const onExcel = async (file: File | undefined) => {
    setExcelRows(null);
    setExcelInfo('');
    if (!file) return;
    try {
      const { parsePlanWorkbook } = await import('@/lib/excel/plan-excel');
      const parsed = await parsePlanWorkbook(await file.arrayBuffer());
      if (parsed.rows.length === 0) {
        setExcelInfo(parsed.fileErrors.join('; ') || 'В файле не найдено задач');
        return;
      }
      const rows = parsed.rows.filter((r) => r.description);
      setExcelRows(
        rows.map((r) => ({
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
      );
      const withErrors = parsed.rows.filter((r) => r.errors.length).length;
      setExcelInfo(
        `Найдено ${rows.length} ${pluralRu(rows.length, 'задача', 'задачи', 'задач')}` +
          (withErrors ? `, строк с замечаниями: ${withErrors}` : ''),
      );
    } catch {
      setExcelInfo('Не удалось прочитать файл. Нужен формат .xlsx.');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      name,
      startDate,
      endDate: endDate || null,
      salesStartDate,
      location: location || null,
    };
    const parsed = forumSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      if (forum) {
        const res = await updateForum(forum.id, input);
        if (!res.ok) return void toast.error(res.error);
        toast.success('Сохранено');
        onOpenChange(false);
        if (res.data.datesChanged && res.data.autoTasks > 0) {
          const ok = await confirm({
            title: 'Пересчитать даты задач?',
            description: `Даты форума изменились. Пересчитать даты у ${res.data.autoTasks} ${pluralRu(res.data.autoTasks, 'задачи', 'задач', 'задач')}, которые не редактировались вручную?`,
            confirmText: 'Пересчитать',
          });
          if (ok) {
            const r = await recalcDates(forum.id);
            if (r.ok) toast.success(`Пересчитано задач: ${r.data}`);
            else toast.error(r.error);
          }
        }
        router.refresh();
      } else {
        let src: PlanSource;
        if (source === 'forum') {
          if (!copyFrom) return void setErrors({ source: 'Выберите форум для копирования' });
          src = { kind: 'forum', forumId: Number(copyFrom) };
        } else if (source === 'excel') {
          if (!excelRows?.length)
            return void setErrors({ source: 'Загрузите файл Excel с планом' });
          src = { kind: 'excel', rows: excelRows };
        } else src = { kind: source };
        const res = await createForum(input, src);
        if (!res.ok) return void toast.error(res.error);
        toast.success(`Форум создан, задач: ${res.data.tasks}`);
        onOpenChange(false);
        router.push(`/forums/${res.data.id}/gantt`);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={isEdit ? 'Редактировать форум' : 'Новый форум'}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field label="Название *" error={errors.name} htmlFor="f-name">
            <Input id="f-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Дата начала *" error={errors.startDate} htmlFor="f-start">
              <DateInput
                id="f-start"
                value={startDate || null}
                onChange={(v) => onStartChange(v ?? '')}
              />
            </Field>
            <Field
              label="Дата окончания"
              error={errors.endDate}
              hint="Для многодневных форумов"
              htmlFor="f-end"
            >
              <DateInput
                id="f-end"
                value={endDate || null}
                min={startDate || null}
                onChange={(v) => setEndDate(v ?? '')}
              />
            </Field>
            <Field
              label="Старт продаж *"
              error={errors.salesStartDate}
              hint="По умолчанию — за 4 месяца до форума"
              htmlFor="f-sales"
            >
              <DateInput
                id="f-sales"
                value={salesStartDate || null}
                onChange={(v) => {
                  setSalesTouched(true);
                  setSalesStartDate(v ?? '');
                }}
              />
            </Field>
            <Field label="Место проведения" error={errors.location} htmlFor="f-loc">
              <Input id="f-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
            </Field>
          </div>

          {!isEdit && (
            <fieldset className="rounded-md border border-line p-3">
              <legend className="px-1 text-xs font-medium text-ink/80">Источник плана</legend>
              <div className="grid gap-1.5 text-sm">
                {(
                  [
                    ['template', 'Копия типового мастер-плана'],
                    ['empty', 'Пустой план'],
                    ['forum', 'Копия плана другого форума'],
                    ['excel', 'Загрузка из Excel'],
                  ] as const
                ).map(([v, label]) => (
                  <label key={v} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="source"
                      value={v}
                      checked={source === v}
                      onChange={() => setSource(v)}
                      className="accent-brand"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {source === 'forum' && (
                <Select
                  className="mt-2"
                  value={copyFrom}
                  onChange={(e) => setCopyFrom(e.target.value)}
                  aria-label="Форум-источник"
                >
                  <option value="">— выберите форум —</option>
                  {forumOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              )}
              {source === 'excel' && (
                <div className="mt-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-line px-3 py-2 text-sm hover:border-brand">
                    <FileSpreadsheet className="size-4 text-brand" />
                    <span>Выберите файл .xlsx</span>
                    <input
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="sr-only"
                      data-testid="create-excel-input"
                      onChange={(e) => onExcel(e.target.files?.[0])}
                    />
                  </label>
                  {excelInfo && <p className="mt-1 text-xs text-ink/70">{excelInfo}</p>}
                </div>
              )}
              {errors.source && <p className="mt-1 text-xs text-status-red">{errors.source}</p>}
            </fieldset>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать форум'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
