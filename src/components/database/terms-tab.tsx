'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EXAMPLE_FORUM } from '@/components/ui/term-combobox';
import { formatDate } from '@/lib/dates';
import { computeTaskDates } from '@/lib/plan';
import type { TermPhraseDTO } from '@/lib/types';
import { deleteTermPhrase, saveTermPhrase, setTermPhraseArchived } from '@/server/actions/dicts';

const EXAMPLE_TEXT = `форум ${formatDate(EXAMPLE_FORUM.startDate)}–${formatDate(
  EXAMPLE_FORUM.endDate,
)}, старт продаж ${formatDate(EXAMPLE_FORUM.salesStartDate)}, этап 2`;

const EXAMPLE_STAGE = { name: '2. Продажи и орг. подготовка', order: 2 };

/** Как система поймёт формулировку — на примере форума. */
export function termPreview(text: string): { ok: boolean; dates: string; note: string | null } {
  const r = computeTaskDates(text, EXAMPLE_STAGE, EXAMPLE_FORUM);
  const dates =
    r.startDate === r.endDate
      ? formatDate(r.startDate)
      : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`;
  return { ok: !r.needsClarification, dates, note: r.note };
}

function Preview({ text }: { text: string }) {
  if (!text.trim()) return null;
  const p = termPreview(text);
  return p.ok ? (
    <span className="inline-flex items-start gap-1 text-status-green">
      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="text-ink">{p.dates}</span>
        {p.note && <span className="text-ink/60"> · в комментарий: {p.note}</span>}
      </span>
    </span>
  ) : (
    <span className="inline-flex items-start gap-1 text-yellow-700">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>не распознаётся — даты на весь этап (примерный срок)</span>
    </span>
  );
}

/** Раздел «Сроки»: справочник формулировок срока. */
export function TermsTab({
  rows,
  usage,
}: {
  rows: TermPhraseDTO[];
  usage: Record<string, number>;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [edit, setEdit] = React.useState<TermPhraseDTO | 'new' | null>(null);
  const used = (t: string) => usage[t.trim().replace(/\s+/g, ' ').toLowerCase()] ?? 0;

  const columns: Column<TermPhraseDTO>[] = [
    {
      key: 'text',
      label: 'Формулировка',
      sortValue: (r) => r.text,
      render: (r) => (
        <span className="font-medium">
          {r.text} {r.archived && <Badge>архив</Badge>}
        </span>
      ),
    },
    {
      key: 'preview',
      label: 'Как считается (пример)',
      sortValue: (r) => (termPreview(r.text).ok ? 0 : 1),
      render: (r) => (
        <span className="text-xs">
          <Preview text={r.text} />
        </span>
      ),
    },
    {
      key: 'usage',
      label: 'Задач',
      className: 'w-24 text-right',
      sortValue: (r) => used(r.text),
      render: (r) => used(r.text),
    },
    {
      key: 'actions',
      label: '',
      className: 'w-28',
      render: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="iconSm" variant="ghost" title="Изменить" onClick={() => setEdit(r)}>
            <Pencil />
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            title={r.archived ? 'Вернуть в список' : 'Скрыть из списка (архив)'}
            onClick={async () => {
              const res = await setTermPhraseArchived(r.id, !r.archived);
              if (!res.ok) return void toast.error(res.error);
              toast.success(r.archived ? 'Возвращено в список' : 'Скрыто из списка');
              router.refresh();
            }}
          >
            {r.archived ? <ArchiveRestore /> : <Archive />}
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            title="Удалить"
            onClick={async () => {
              const n = used(r.text);
              const ok = await confirm({
                title: `Удалить «${r.text}»?`,
                description: n
                  ? `Формулировка используется в ${n} задачах — у них текст срока и даты останутся, она лишь пропадёт из списка выбора.`
                  : 'Формулировка пропадёт из списка выбора.',
                confirmText: 'Удалить',
                danger: true,
              });
              if (!ok) return;
              const res = await deleteTermPhrase(r.id);
              if (!res.ok) return void toast.error(res.error);
              toast.success('Удалено');
              router.refresh();
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-3 rounded-md border border-line bg-surface p-3 text-sm text-ink/80">
        <p className="font-medium text-ink">Как работают сроки задач</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>
            Эти формулировки — выпадающий список в поле «Срок» у задач форумов и мастер-плана.
            Начните печатать — список отфильтруется; можно ввести и свой вариант.
          </li>
          <li>
            Даты начала и окончания задачи система считает сама — от дат форума и старта продаж.
          </li>
          <li>
            Поменяли срок у задачи — её даты пересчитаются сразу. Изменили даты форума или старта
            продаж — система предложит пересчитать даты задач (кроме тех, где даты поставлены
            вручную).
          </li>
          <li>
            Столбец «Как считается» показывает результат на примере: {EXAMPLE_TEXT}. ⚠ — система не
            поняла формулировку и ставит на задачу весь этап.
          </li>
        </ul>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        searchText={(r) => r.text}
        onRowClick={setEdit}
        rowClassName={(r) => (r.archived ? 'text-ink/50' : undefined)}
        emptyText="Формулировок пока нет"
        toolbar={
          <Button onClick={() => setEdit('new')} data-testid="term-add">
            <Plus /> Добавить формулировку
          </Button>
        }
      />
      <TermDialog
        item={edit === 'new' ? null : edit}
        open={edit !== null}
        onOpenChange={(o) => !o && setEdit(null)}
      />
    </>
  );
}

function TermDialog({
  item,
  open,
  onOpenChange,
}: {
  item: TermPhraseDTO | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [text, setText] = React.useState('');
  const [error, setError] = React.useState('');
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setText(item?.text ?? '');
    setError('');
  }, [open, item]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const res = await saveTermPhrase({ id: item?.id, text });
    setPending(false);
    if (!res.ok) return setError(res.error);
    toast.success(item ? 'Формулировка изменена' : 'Формулировка добавлена');
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={item ? 'Изменить формулировку' : 'Новая формулировка срока'}>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Формулировка" error={error} htmlFor="term-text">
            <Input
              id="term-text"
              autoFocus
              value={text}
              placeholder="Например: за 3 недели до форума"
              onChange={(e) => {
                setText(e.target.value);
                setError('');
              }}
            />
          </Field>
          <div className="min-h-[20px] text-sm">
            <Preview text={text} />
          </div>
          <details className="text-xs text-ink/70">
            <summary className="cursor-pointer text-brand">
              Какие формулировки понимает система
            </summary>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>за 2 недели / за месяц / за 8-9 недель до форума</li>
              <li>за 3 дня до старта продаж, до старта продаж, с начала продаж</li>
              <li>в течение недели / через 3 дня после старта продаж</li>
              <li>в день форума, накануне форума, в течение 5 рабочих дней после форума</li>
              <li>до 15.10.2026, с 01.10 по 15.10, 01.12–15.12</li>
              <li>на протяжении этапа, контрольная точка за 4 месяца</li>
            </ul>
            <p className="mt-1">Уточнения в скобках или после «;» уходят в комментарий задачи.</p>
          </details>
          {item && (
            <p className="text-xs text-ink/60">
              Изменение формулировки не меняет уже созданные задачи — только список выбора.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending || !text.trim()}>
              {pending ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
