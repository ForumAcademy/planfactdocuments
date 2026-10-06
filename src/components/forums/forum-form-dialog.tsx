'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FORUM_COLORS, FORUM_COLOR_KEYS, type ForumColor } from '@/lib/forum-colors';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, FileSpreadsheet } from 'lucide-react';
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
import { cn, pluralRu } from '@/lib/utils';

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
  const [website, setWebsite] = useState('');
  const [color, setColor] = useState<ForumColor>('blue');
  const [source, setSource] = useState<SourceKind>('template');
  const [copyFrom, setCopyFrom] = useState<string>('');
  const [excelRows, setExcelRows] = useState<PlanRowInput[] | null>(null);
  const [excelInfo, setExcelInfo] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  // Создание — в 2 шага: 1) запланировать форум, 2) сформировать план подготовки
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (!open) return;
    setName(forum?.name ?? '');
    setStartDate(forum?.startDate ?? '');
    setEndDate(forum?.endDate ?? '');
    setSalesStartDate(forum?.salesStartDate ?? '');
    setSalesTouched(Boolean(forum));
    setLocation(forum?.location ?? '');
    setWebsite(forum?.website ?? '');
    setColor((forum?.color as ForumColor) ?? 'blue');
    setSource('template');
    setCopyFrom('');
    setExcelRows(null);
    setExcelInfo('');
    setErrors({});
    setStep(1);
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

  const forumInput = () => ({
    name,
    startDate,
    endDate: endDate || null,
    salesStartDate,
    location: location || null,
    website: website || null,
    color,
  });

  // Исправили поле — его ошибка сразу исчезает (остальные остаются до «Далее»)
  useEffect(() => {
    setErrors((prev) => {
      const keys = Object.keys(prev).filter((k) => k !== 'source');
      if (!keys.length) return prev;
      const parsed = forumSchema.safeParse({
        name,
        startDate,
        endDate: endDate || null,
        salesStartDate,
        location: location || null,
        website: website || null,
        color,
      });
      const now = parsed.success ? {} : fieldErrors(parsed.error);
      const next = { ...prev };
      for (const k of keys) if (!now[k]) delete next[k];
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [name, startDate, endDate, salesStartDate, location, website, color]);

  /** Шаг 1 → шаг 2: сначала проверяем поля форума. */
  const goNext = () => {
    const parsed = forumSchema.safeParse(forumInput());
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setStep(2);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && step === 1) return goNext();
    const input = {
      name,
      startDate,
      endDate: endDate || null,
      salesStartDate,
      location: location || null,
      website: website || null,
      color,
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
    } catch (err) {
      console.error(err);
      toast.error(
        'Не удалось сохранить: сервер не ответил. Проверьте список форумов и попробуйте ещё раз.',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={isEdit ? 'Редактировать форум' : 'Новый форум'} wide={!isEdit}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          {!isEdit && <Steps step={step} onStep={(s) => (s === 1 ? setStep(1) : goNext())} />}
          {(isEdit || step === 1) && (
            <>
              <Field label="Название *" error={errors.name} htmlFor="f-name">
                <Input
                  id="f-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
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
                  <Input
                    id="f-loc"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </Field>
                <Field label="Цвет карточки" className="sm:col-span-2">
                  <ColorPicker value={color} onChange={setColor} />
                </Field>
                <Field label="Сайт" error={errors.website} htmlFor="f-site">
                  <Input
                    id="f-site"
                    type="text"
                    inputMode="url"
                    placeholder="https://forum.ru"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </Field>
              </div>
            </>
          )}

          {!isEdit && step === 2 && (
            <div>
              <div
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                role="radiogroup"
                aria-label="План подготовки"
              >
                {PLAN_OPTIONS.map((o) => (
                  <label
                    key={o.kind}
                    className={cn(
                      'flex cursor-pointer flex-col overflow-hidden rounded-lg border-2 transition',
                      source === o.kind
                        ? 'border-brand shadow-sm'
                        : 'border-line hover:border-brand/40',
                    )}
                    data-testid={`plan-${o.kind}`}
                  >
                    <input
                      type="radio"
                      name="source"
                      value={o.kind}
                      checked={source === o.kind}
                      onChange={() => setSource(o.kind)}
                      className="sr-only"
                      aria-label={o.title}
                    />
                    <span
                      className={cn(
                        'flex h-28 items-center justify-center',
                        source === o.kind ? 'bg-brand-light' : 'bg-surface',
                      )}
                    >
                      <PlanArt kind={o.kind} />
                    </span>
                    <span className="block p-3">
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded-full border-2',
                            source === o.kind ? 'border-brand' : 'border-line',
                          )}
                        >
                          {source === o.kind && <span className="size-2 rounded-full bg-brand" />}
                        </span>
                        {o.title}
                      </span>
                      <span className="mt-1 block text-xs text-ink/60">
                        {o.kind === 'excel' ? (
                          <>
                            Скачайте{' '}
                            <a
                              href="/api/templates/master-plan"
                              className="text-brand underline hover:text-brand-dark"
                              onClick={(e) => e.stopPropagation()}
                              data-testid="master-plan-template"
                            >
                              шаблон мастер-плана
                            </a>
                            , заполните и загрузите
                          </>
                        ) : (
                          o.hint
                        )}
                      </span>
                    </span>
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
              {errors.source && <p className="mt-1 text-xs text-status-red">{errors.source}</p>}
            </div>
          )}

          <DialogFooter>
            {!isEdit && step === 2 ? (
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft /> Назад
              </Button>
            ) : (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
            )}
            {!isEdit && step === 1 ? (
              <Button type="submit" data-testid="forum-next">
                Далее <ArrowRight />
              </Button>
            ) : (
              <Button type="submit" disabled={pending}>
                {pending ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать форум'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Выбор цвета карточки форума — кружки-образцы. */
export function ColorPicker({
  value,
  onChange,
}: {
  value: ForumColor;
  onChange: (c: ForumColor) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 py-1"
      role="radiogroup"
      aria-label="Цвет карточки"
    >
      {FORUM_COLOR_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          title={FORUM_COLORS[k].label}
          aria-label={FORUM_COLORS[k].label}
          onClick={() => onChange(k)}
          className={cn(
            'size-7 rounded-full border border-black/10 ring-offset-2 transition',
            value === k ? 'ring-2 ring-ink/70' : 'hover:scale-110',
          )}
          style={{ background: FORUM_COLORS[k].hex }}
          data-testid={`forum-color-${k}`}
        />
      ))}
    </div>
  );
}

const PLAN_OPTIONS: { kind: SourceKind; title: string; hint: string }[] = [
  {
    kind: 'template',
    title: 'Создать типовой',
    hint: 'Все задачи мастер-плана из «Базы данных». Сроки рассчитаются от дат форума',
  },
  {
    kind: 'empty',
    title: 'Собрать вручную',
    hint: 'Пустой план — задачи добавите сами или загрузите позже',
  },
  {
    kind: 'forum',
    title: 'Скопировать из другого форума',
    hint: 'Задачи и ответственные; сроки пересчитаются, статусы обнулятся',
  },
  { kind: 'excel', title: 'Загрузить из xls', hint: '' },
];

/** Шаги создания форума. */
function Steps({ step, onStep }: { step: 1 | 2; onStep: (s: 1 | 2) => void }) {
  const items: [1 | 2, string][] = [
    [1, 'Запланировать форум'],
    [2, 'Сформировать план подготовки'],
  ];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" data-testid="forum-steps">
      {items.map(([n, label], i) => (
        <li key={n} className="flex items-center gap-2">
          {i > 0 && <span className="h-px w-6 bg-line" aria-hidden />}
          <button
            type="button"
            onClick={() => onStep(n)}
            aria-current={step === n ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-full py-1 pl-1 pr-3',
              step === n ? 'bg-brand-light font-medium text-brand' : 'text-ink/60 hover:text-ink',
            )}
          >
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                step === n ? 'bg-brand text-white' : 'bg-surface text-ink/60',
              )}
            >
              {n}
            </span>
            Шаг {n}. {label}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Иллюстрации к вариантам плана (рисуются кодом, в цветах сайта). */
function PlanArt({ kind }: { kind: SourceKind }) {
  const B = '#0A0A9F';
  const L = '#D9DBF5';
  const T = '#32AAB5';
  const W = '#FFFFFF';
  const common = { width: 132, height: 92, viewBox: '0 0 132 92', 'aria-hidden': true } as const;
  if (kind === 'template')
    return (
      <svg {...common}>
        <rect x="30" y="8" width="64" height="78" rx="6" fill={W} stroke={L} strokeWidth="2" />
        <rect x="48" y="3" width="28" height="10" rx="3" fill={B} />
        {[24, 40, 56, 72].map((y, i) => (
          <g key={y}>
            <rect
              x="38"
              y={y - 5}
              width="10"
              height="10"
              rx="2"
              fill={i < 3 ? T : W}
              stroke={T}
              strokeWidth="1.5"
            />
            {i < 3 && (
              <path
                d={`M40.5 ${y} l2.5 2.5 l4.5 -5`}
                stroke={W}
                strokeWidth="1.8"
                fill="none"
                strokeLinecap="round"
              />
            )}
            <rect x="53" y={y - 2.5} width={i % 2 ? 26 : 32} height="5" rx="2.5" fill={L} />
          </g>
        ))}
        <circle cx="98" cy="66" r="15" fill={B} />
        <path d="M98 58 v8 l6 4" stroke={W} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </svg>
    );
  if (kind === 'empty')
    return (
      <svg {...common}>
        <rect x="26" y="10" width="64" height="74" rx="6" fill={W} stroke={L} strokeWidth="2" />
        {[26, 40, 54].map((y) => (
          <g key={y}>
            <rect
              x="34"
              y={y - 5}
              width="10"
              height="10"
              rx="2"
              fill={W}
              stroke={L}
              strokeWidth="1.5"
            />
            <rect
              x="49"
              y={y - 2.5}
              width="30"
              height="5"
              rx="2.5"
              fill={L}
              strokeDasharray="3 3"
            />
          </g>
        ))}
        <circle cx="39" cy="68" r="6" fill={T} />
        <path d="M39 65 v6 M36 68 h6" stroke={W} strokeWidth="1.8" strokeLinecap="round" />
        <g transform="rotate(40 100 44)">
          <rect x="94" y="14" width="12" height="52" rx="2" fill={B} />
          <path d="M94 66 h12 l-6 12 z" fill="#F1AA60" />
          <rect x="94" y="14" width="12" height="8" rx="2" fill={T} />
        </g>
      </svg>
    );
  if (kind === 'forum')
    return (
      <svg {...common}>
        <rect x="18" y="14" width="52" height="64" rx="6" fill={W} stroke={L} strokeWidth="2" />
        {[28, 40, 52, 64].map((y) => (
          <rect key={y} x="27" y={y - 2.5} width="34" height="5" rx="2.5" fill={L} />
        ))}
        <rect x="62" y="8" width="52" height="64" rx="6" fill={B} />
        {[22, 34, 46, 58].map((y) => (
          <rect key={y} x="71" y={y - 2.5} width="34" height="5" rx="2.5" fill="#5A5AC8" />
        ))}
        <circle cx="66" cy="78" r="11" fill={T} />
        <path
          d="M60 78 h11 m-4 -4 l4 4 l-4 4"
          stroke={W}
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="22" y="12" width="76" height="62" rx="6" fill={W} stroke={L} strokeWidth="2" />
      <rect x="22" y="12" width="76" height="14" rx="6" fill={T} />
      <rect x="22" y="20" width="76" height="6" fill={T} />
      {[34, 46, 58].map((y) => (
        <g key={y}>
          <rect x="30" y={y - 3} width="16" height="6" rx="2" fill={L} />
          <rect x="51" y={y - 3} width="16" height="6" rx="2" fill={L} />
          <rect x="72" y={y - 3} width="18" height="6" rx="2" fill={L} />
        </g>
      ))}
      <text x="31" y="23" fontSize="9" fontWeight="700" fill={W} fontFamily="Arial, sans-serif">
        XLS
      </text>
      <circle cx="98" cy="70" r="15" fill={B} />
      <path
        d="M98 78 v-15 m-6 6 l6 -6 l6 6"
        stroke={W}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
