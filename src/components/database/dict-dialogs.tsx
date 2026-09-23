'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import type { DictsDTO, EmployeeDTO, NamedDTO, StageDTO } from '@/lib/types';
import { employeeSchema, fieldErrors } from '@/lib/validation';
import { STAGE_COLORS } from '@/lib/plan';
import { saveEmployee, saveNamed, saveStage, saveTemplate } from '@/server/actions/dicts';
import type { TemplateDTO } from '@/server/queries';

export function EmployeeDialog({
  open,
  onOpenChange,
  employee,
  roles,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employee: EmployeeDTO | null;
  roles: NamedDTO[];
}) {
  const router = useRouter();
  const [f, setF] = useState({
    fullName: '',
    position: '',
    telegram: '',
    active: true,
    roleIds: [] as number[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({
      fullName: employee?.fullName ?? '',
      position: employee?.position ?? '',
      telegram: employee?.telegram ?? '',
      active: employee?.active ?? true,
      roleIds: employee?.roleIds ?? [],
    });
    setErrors({});
  }, [open, employee]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = employeeSchema.safeParse(f);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setPending(true);
    const res = await saveEmployee(employee?.id ?? null, f);
    setPending(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success('Сохранено');
    onOpenChange(false);
    router.refresh();
  };

  const roleOptions = roles
    .filter((r) => !r.archived || f.roleIds.includes(r.id))
    .map((r) => ({ value: String(r.id), label: r.name }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={employee ? 'Сотрудник' : 'Новый сотрудник'}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field label="ФИО *" error={errors.fullName}>
            <Input
              value={f.fullName}
              onChange={(e) => setF({ ...f, fullName: e.target.value })}
              autoFocus
            />
          </Field>
          <Field label="Должность" error={errors.position}>
            <Input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} />
          </Field>
          <Field label="Роли / отдел" hint="Можно выбрать несколько">
            <MultiSelect
              options={roleOptions}
              value={f.roleIds.map(String)}
              onChange={(v) => setF({ ...f, roleIds: v.map(Number) })}
              placeholder="Выберите роли"
            />
          </Field>
          <Field
            label="Ник в Telegram (для напоминаний)"
            error={errors.telegram}
            hint={
              employee?.telegramLinked
                ? 'Напоминания подключены. Если сменить ник, сотруднику нужно будет снова нажать /start у бота.'
                : 'После сохранения сотрудник открывает бота в Telegram и нажимает «Старт» — бот узнает его по нику.'
            }
          >
            <Input
              value={f.telegram}
              placeholder="@username"
              onChange={(e) => setF({ ...f, telegram: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-brand"
              checked={f.active}
              onChange={(e) => setF({ ...f, active: e.target.checked })}
            />
            Активен (предлагается при выборе ответственных и получает напоминания)
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NamedDialog({
  kind,
  open,
  onOpenChange,
  item,
  nextOrder,
}: {
  kind: 'stage' | 'block' | 'role';
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: NamedDTO | StageDTO | null;
  nextOrder: number;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [order, setOrder] = useState('1');
  const [color, setColor] = useState(STAGE_COLORS[0]);
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setOrder(String(item?.order ?? nextOrder));
    setColor(
      item && 'color' in item ? item.color : STAGE_COLORS[(nextOrder - 1) % STAGE_COLORS.length],
    );
    setArchived(item?.archived ?? false);
    setError('');
  }, [open, item, nextOrder]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Укажите название');
    const ord = Number(order);
    if (!Number.isInteger(ord) || ord < 0) return setError('Порядок — целое неотрицательное число');
    setPending(true);
    const base = { id: item?.id, name: name.trim(), order: ord, archived };
    const res =
      kind === 'stage' ? await saveStage({ ...base, color }) : await saveNamed(kind, base);
    setPending(false);
    if (!res.ok) return setError(res.error);
    toast.success('Сохранено');
    onOpenChange(false);
    router.refresh();
  };

  const title = { stage: 'Этап', block: 'Блок / направление', role: 'Роль' }[kind];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={item ? title : `Новое значение: ${title.toLowerCase()}`}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field label="Название *">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Порядковый номер">
              <Input
                type="number"
                min={0}
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </Field>
            {kind === 'stage' && (
              <Field label="Цвет на диаграмме Ганта">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-line"
                    aria-label="Цвет этапа"
                  />
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="font-mono"
                  />
                </div>
              </Field>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-brand"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            В архиве (не предлагается при выборе)
          </label>
          {error && <p className="text-sm text-status-red">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TemplateDialog({
  open,
  onOpenChange,
  item,
  dicts,
  nextNumber,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: TemplateDTO | null;
  dicts: DictsDTO;
  nextNumber: number;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    number: '',
    stageId: '',
    blockId: '',
    description: '',
    termText: '',
    comment: '',
    roleIds: [] as number[],
  });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({
      number: String(item?.number ?? nextNumber),
      stageId: item?.stageId ? String(item.stageId) : '',
      blockId: item?.blockId ? String(item.blockId) : '',
      description: item?.description ?? '',
      termText: item?.termText ?? '',
      comment: item?.comment ?? '',
      roleIds: item?.roleIds ?? [],
    });
    setError('');
  }, [open, item, nextNumber]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.description.trim()) return setError('Укажите описание задачи');
    const num = Number(f.number);
    if (!Number.isInteger(num) || num < 1) return setError('№ — целое положительное число');
    setPending(true);
    const res = await saveTemplate(item?.id ?? null, {
      number: num,
      stageId: f.stageId ? Number(f.stageId) : null,
      blockId: f.blockId ? Number(f.blockId) : null,
      description: f.description,
      termText: f.termText,
      comment: f.comment,
      roleIds: f.roleIds,
    });
    setPending(false);
    if (!res.ok) return setError(res.error);
    toast.success('Сохранено');
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={item ? `Задача мастер-плана №${item.number}` : 'Новая задача мастер-плана'}
        wide
      >
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[100px_1fr_1fr]">
            <Field label="№">
              <Input
                type="number"
                min={1}
                value={f.number}
                onChange={(e) => setF({ ...f, number: e.target.value })}
              />
            </Field>
            <Field label="Этап">
              <Select value={f.stageId} onChange={(e) => setF({ ...f, stageId: e.target.value })}>
                <option value="">— не указан —</option>
                {dicts.stages
                  .filter((s) => !s.archived || String(s.id) === f.stageId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Блок / направление">
              <Select value={f.blockId} onChange={(e) => setF({ ...f, blockId: e.target.value })}>
                <option value="">— не указан —</option>
                {dicts.blocks
                  .filter((s) => !s.archived || String(s.id) === f.blockId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
          <Field label="Описание задачи *">
            <Textarea
              rows={3}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Срок (текстом)"
              hint="Например: «за 6 недель до форума», «до старта продаж»"
            >
              <Input
                value={f.termText}
                onChange={(e) => setF({ ...f, termText: e.target.value })}
              />
            </Field>
            <Field label="Роли">
              <MultiSelect
                options={dicts.roles
                  .filter((r) => !r.archived || f.roleIds.includes(r.id))
                  .map((r) => ({ value: String(r.id), label: r.name }))}
                value={f.roleIds.map(String)}
                onChange={(v) => setF({ ...f, roleIds: v.map(Number) })}
              />
            </Field>
          </div>
          <Field label="Комментарий">
            <Textarea
              rows={2}
              value={f.comment}
              onChange={(e) => setF({ ...f, comment: e.target.value })}
            />
          </Field>
          {error && <p className="text-sm text-status-red">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
