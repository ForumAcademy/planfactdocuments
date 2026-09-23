'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, DatabaseZap, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { forumDateRange } from '@/components/forums/forum-card';
import { ForumFormDialog } from '@/components/forums/forum-form-dialog';
import type { EmployeeDTO, ForumDTO, NamedDTO, StageDTO } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { DatabaseData, TemplateDTO } from '@/server/queries';
import { deleteDictItem, setDictArchived, type DictKind } from '@/server/actions/dicts';
import { deleteForum, setForumArchived } from '@/server/actions/forums';
import { EmployeeDialog, NamedDialog, TemplateDialog } from './dict-dialogs';

const TABS = [
  { key: 'employees', label: 'Ответственные' },
  { key: 'stages', label: 'Этапы' },
  { key: 'blocks', label: 'Блоки / направления' },
  { key: 'roles', label: 'Роли' },
  { key: 'templates', label: 'Задачи (мастер-план)' },
  { key: 'forums', label: 'Форумы' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function RowActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

function useDictOps() {
  const router = useRouter();
  const confirm = useConfirm();
  const remove = async (kind: DictKind, id: number, name: string) => {
    const ok = await confirm({
      title: `Удалить «${name}»?`,
      description: 'Значение будет удалено из справочника.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    const res = await deleteDictItem(kind, id);
    if (!res.ok) return void toast.error(res.error);
    if (res.data.deleted) {
      toast.success('Удалено');
      router.refresh();
      return;
    }
    if (kind === 'template') return;
    const arch = await confirm({
      title: 'Значение используется',
      description: `«${name}» используется в ${res.data.usedIn} записях, поэтому удалить его нельзя. Перенести в архив? Архивные значения не предлагаются при выборе, но сохраняются в существующих задачах.`,
      confirmText: 'Архивировать',
    });
    if (arch) await archive(kind, id, true);
  };
  const archive = async (kind: Exclude<DictKind, 'template'>, id: number, archived: boolean) => {
    const res = await setDictArchived(kind, id, archived);
    if (!res.ok) return void toast.error(res.error);
    toast.success(archived ? 'Перенесено в архив' : 'Восстановлено из архива');
    router.refresh();
  };
  return { remove, archive };
}

export function DatabaseView({ data }: { data: DatabaseData }) {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = (TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'employees') as TabKey;
  const setTab = (t: TabKey) => router.replace(`/database?tab=${t}`, { scroll: false });
  const [seeding, setSeeding] = useState(false);

  const seed = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/admin/seed', { method: 'POST' });
      const json = (await res.json()) as { message?: string; error?: string };
      if (res.ok) {
        toast.success(json.message ?? 'Готово');
        router.refresh();
      } else toast.error(json.error ?? 'Ошибка');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">База данных</h1>
        <Button
          variant="outline"
          onClick={seed}
          disabled={seeding}
          title="Заполнить справочники и типовой мастер-план из seed/master-plan.xlsx"
        >
          <DatabaseZap /> {seeding ? 'Загружаем…' : 'Загрузить начальные данные'}
        </Button>
      </div>
      <div
        className="thin-scroll mt-4 flex gap-1 overflow-x-auto border-b border-line"
        role="tablist"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm',
              tab === t.key
                ? 'border-brand font-medium text-brand'
                : 'border-transparent text-ink/70 hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === 'employees' && <EmployeesTab data={data} />}
        {tab === 'stages' && (
          <NamedTab kind="stage" rows={data.dicts.stages} usage={data.usage.stage} />
        )}
        {tab === 'blocks' && (
          <NamedTab kind="block" rows={data.dicts.blocks} usage={data.usage.block} />
        )}
        {tab === 'roles' && (
          <NamedTab kind="role" rows={data.dicts.roles} usage={data.usage.role} />
        )}
        {tab === 'templates' && <TemplatesTab data={data} />}
        {tab === 'forums' && <ForumsTab forums={data.forums} />}
      </div>
    </div>
  );
}

function EmployeesTab({ data }: { data: DatabaseData }) {
  const { remove, archive } = useDictOps();
  const [edit, setEdit] = useState<EmployeeDTO | null | 'new'>(null);
  const roleName = useMemo(
    () => new Map(data.dicts.roles.map((r) => [r.id, r.name])),
    [data.dicts.roles],
  );
  const columns: Column<EmployeeDTO>[] = [
    {
      key: 'fullName',
      label: 'ФИО',
      sortValue: (r) => r.fullName,
      render: (r) => <span className="font-medium">{r.fullName}</span>,
    },
    {
      key: 'position',
      label: 'Должность',
      sortValue: (r) => r.position,
      render: (r) => r.position,
    },
    {
      key: 'roles',
      label: 'Роли / отдел',
      sortValue: (r) => r.roleIds.map((id) => roleName.get(id)).join(', '),
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.roleIds.map((id) => (
            <Badge key={id}>{roleName.get(id)}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'telegram',
      label: 'Telegram',
      sortValue: (r) => r.telegram,
      render: (r) =>
        r.telegram ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {r.telegram}
            {r.telegramLinked ? (
              <Badge className="bg-green-50 text-status-green">напоминания подключены</Badge>
            ) : (
              <Badge className="bg-yellow-50 text-yellow-800">ждём /start у бота</Badge>
            )}
          </span>
        ) : (
          <span className="text-status-gray">—</span>
        ),
    },
    {
      key: 'active',
      label: 'Активен',
      sortValue: (r) => (r.active ? 1 : 0),
      render: (r) => (r.active ? 'Да' : <span className="text-status-gray">Нет</span>),
    },
    {
      key: 'usage',
      label: 'Задач',
      className: 'text-right',
      sortValue: (r) => data.usage.employee[r.id] ?? 0,
      render: (r) => data.usage.employee[r.id] ?? 0,
    },
    {
      key: 'actions',
      label: '',
      className: 'w-28',
      render: (r) => (
        <RowActions>
          <Button size="iconSm" variant="ghost" title="Редактировать" onClick={() => setEdit(r)}>
            <Pencil />
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            title={r.active ? 'Архивировать' : 'Восстановить'}
            onClick={() => archive('employee', r.id, r.active)}
          >
            {r.active ? <Archive /> : <ArchiveRestore />}
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            title="Удалить"
            onClick={() => remove('employee', r.id, r.fullName)}
          >
            <Trash2 />
          </Button>
        </RowActions>
      ),
    },
  ];
  return (
    <>
      <DataTable
        rows={data.dicts.employees}
        columns={columns}
        initialSort={{ key: 'fullName', dir: 'asc' }}
        searchText={(r) =>
          [r.fullName, r.position, r.telegram, ...r.roleIds.map((id) => roleName.get(id))].join(' ')
        }
        onRowClick={setEdit}
        rowClassName={(r) => (r.active ? undefined : 'text-ink/50')}
        toolbar={
          <Button onClick={() => setEdit('new')}>
            <Plus /> Добавить сотрудника
          </Button>
        }
      />
      <EmployeeDialog
        open={edit !== null}
        onOpenChange={(o) => !o && setEdit(null)}
        employee={edit === 'new' ? null : edit}
        roles={data.dicts.roles}
      />
    </>
  );
}

const KIND_TITLES = {
  stage: { add: 'Добавить этап', one: 'этап' },
  block: { add: 'Добавить блок', one: 'блок' },
  role: { add: 'Добавить роль', one: 'роль' },
};

function NamedTab({
  kind,
  rows,
  usage,
}: {
  kind: 'stage' | 'block' | 'role';
  rows: (NamedDTO | StageDTO)[];
  usage: Record<number, number>;
}) {
  const { remove, archive } = useDictOps();
  const [edit, setEdit] = useState<NamedDTO | StageDTO | null | 'new'>(null);
  const columns: Column<NamedDTO | StageDTO>[] = [
    {
      key: 'order',
      label: 'Порядок',
      className: 'w-24',
      sortValue: (r) => r.order,
      render: (r) => r.order,
    },
    {
      key: 'name',
      label: 'Название',
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="inline-flex items-center gap-2 font-medium">
          {'color' in r && <span className="size-3 rounded-sm" style={{ background: r.color }} />}
          {r.name}
          {r.archived && <Badge>архив</Badge>}
        </span>
      ),
    },
    {
      key: 'usage',
      label: 'Используется',
      className: 'w-32 text-right',
      sortValue: (r) => usage[r.id] ?? 0,
      render: (r) => usage[r.id] ?? 0,
    },
    {
      key: 'actions',
      label: '',
      className: 'w-28',
      render: (r) => (
        <RowActions>
          <Button size="iconSm" variant="ghost" title="Редактировать" onClick={() => setEdit(r)}>
            <Pencil />
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            title={r.archived ? 'Восстановить' : 'Архивировать'}
            onClick={() => archive(kind, r.id, !r.archived)}
          >
            {r.archived ? <ArchiveRestore /> : <Archive />}
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            title="Удалить"
            onClick={() => remove(kind, r.id, r.name)}
          >
            <Trash2 />
          </Button>
        </RowActions>
      ),
    },
  ];
  const nextOrder = rows.reduce((m, r) => Math.max(m, r.order), 0) + 1;
  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        initialSort={{ key: 'order', dir: 'asc' }}
        searchText={(r) => r.name}
        onRowClick={setEdit}
        rowClassName={(r) => (r.archived ? 'text-ink/50' : undefined)}
        toolbar={
          <Button onClick={() => setEdit('new')}>
            <Plus /> {KIND_TITLES[kind].add}
          </Button>
        }
      />
      <NamedDialog
        kind={kind}
        open={edit !== null}
        onOpenChange={(o) => !o && setEdit(null)}
        item={edit === 'new' ? null : edit}
        nextOrder={nextOrder}
      />
    </>
  );
}

function TemplatesTab({ data }: { data: DatabaseData }) {
  const { remove } = useDictOps();
  const [edit, setEdit] = useState<TemplateDTO | null | 'new'>(null);
  const stage = useMemo(
    () => new Map(data.dicts.stages.map((s) => [s.id, s])),
    [data.dicts.stages],
  );
  const block = useMemo(
    () => new Map(data.dicts.blocks.map((s) => [s.id, s.name])),
    [data.dicts.blocks],
  );
  const role = useMemo(
    () => new Map(data.dicts.roles.map((s) => [s.id, s.name])),
    [data.dicts.roles],
  );
  const columns: Column<TemplateDTO>[] = [
    {
      key: 'number',
      label: '№',
      className: 'w-14',
      sortValue: (r) => r.number,
      render: (r) => r.number,
    },
    {
      key: 'stage',
      label: 'Этап',
      className: 'min-w-40',
      sortValue: (r) => (r.stageId ? (stage.get(r.stageId)?.order ?? 0) : 999),
      render: (r) => (r.stageId ? stage.get(r.stageId)?.name : ''),
    },
    {
      key: 'block',
      label: 'Блок',
      className: 'min-w-36',
      sortValue: (r) => (r.blockId ? (block.get(r.blockId) ?? '') : ''),
      render: (r) => (r.blockId ? block.get(r.blockId) : ''),
    },
    {
      key: 'description',
      label: 'Описание задачи',
      className: 'min-w-72',
      sortValue: (r) => r.description,
      render: (r) => r.description,
    },
    {
      key: 'term',
      label: 'Срок',
      className: 'min-w-40',
      sortValue: (r) => r.termText,
      render: (r) => r.termText,
    },
    {
      key: 'roles',
      label: 'Роли',
      className: 'min-w-36',
      sortValue: (r) => r.roleIds.map((id) => role.get(id)).join(', '),
      render: (r) => r.roleIds.map((id) => role.get(id)).join(' / '),
    },
    {
      key: 'actions',
      label: '',
      className: 'w-20',
      render: (r) => (
        <RowActions>
          <Button size="iconSm" variant="ghost" title="Редактировать" onClick={() => setEdit(r)}>
            <Pencil />
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            title="Удалить"
            onClick={() => remove('template', r.id, `задачу №${r.number}`)}
          >
            <Trash2 />
          </Button>
        </RowActions>
      ),
    },
  ];
  return (
    <>
      <p className="mb-3 text-sm text-ink/70">
        Типовой мастер-план используется при создании нового форума (вариант «Стандартный список
        задач»). Даты задач вычисляются по тексту срока относительно дат форума.
      </p>
      <DataTable
        rows={data.templates}
        columns={columns}
        initialSort={{ key: 'number', dir: 'asc' }}
        searchText={(r) =>
          [
            r.number,
            r.description,
            r.termText,
            r.comment,
            r.stageId && stage.get(r.stageId)?.name,
            r.blockId && block.get(r.blockId),
            ...r.roleIds.map((id) => role.get(id)),
          ].join(' ')
        }
        onRowClick={setEdit}
        toolbar={
          <Button onClick={() => setEdit('new')}>
            <Plus /> Добавить задачу
          </Button>
        }
      />
      <TemplateDialog
        open={edit !== null}
        onOpenChange={(o) => !o && setEdit(null)}
        item={edit === 'new' ? null : edit}
        dicts={data.dicts}
        nextNumber={data.templates.reduce((m, t) => Math.max(m, t.number), 0) + 1}
      />
    </>
  );
}

function ForumsTab({ forums }: { forums: (ForumDTO & { taskCount: number })[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<ForumDTO | null | 'new'>(null);
  const options = forums.map((f) => ({ id: f.id, name: f.name }));
  const columns: Column<ForumDTO & { taskCount: number }>[] = [
    {
      key: 'name',
      label: 'Название',
      sortValue: (r) => r.name,
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: 'date',
      label: 'Даты проведения',
      sortValue: (r) => r.startDate,
      render: (r) => forumDateRange(r),
    },
    { key: 'location', label: 'Место', sortValue: (r) => r.location, render: (r) => r.location },
    {
      key: 'website',
      label: 'Сайт',
      sortValue: (r) => r.website,
      render: (r) =>
        r.website ? (
          <a
            href={r.website}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {r.website.replace(/^https?:\/\//, '').replace(/^www\./, '')}
          </a>
        ) : null,
    },
    {
      key: 'tasks',
      label: 'Задач',
      className: 'text-right',
      sortValue: (r) => r.taskCount,
      render: (r) => r.taskCount,
    },
    {
      key: 'archived',
      label: 'Статус',
      sortValue: (r) => (r.archived ? 1 : 0),
      render: (r) => (r.archived ? <Badge>архив</Badge> : 'Активный'),
    },
    {
      key: 'actions',
      label: '',
      className: 'w-28',
      render: (r) => (
        <RowActions>
          <Button size="iconSm" variant="ghost" title="Редактировать" onClick={() => setEdit(r)}>
            <Pencil />
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            title={r.archived ? 'Вернуть из архива' : 'Архивировать'}
            onClick={async () => {
              const res = await setForumArchived(r.id, !r.archived);
              if (res.ok) router.refresh();
              else toast.error(res.error);
            }}
          >
            {r.archived ? <ArchiveRestore /> : <Archive />}
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            title="Удалить"
            onClick={async () => {
              const ok = await confirm({
                title: `Удалить форум «${r.name}»?`,
                description: 'Будут удалены все задачи и отчёт форума. Действие нельзя отменить.',
                confirmText: 'Удалить навсегда',
                danger: true,
              });
              if (!ok) return;
              const res = await deleteForum(r.id);
              if (res.ok) {
                toast.success('Форум удалён');
                router.refresh();
              } else toast.error(res.error);
            }}
          >
            <Trash2 />
          </Button>
        </RowActions>
      ),
    },
  ];
  return (
    <>
      <DataTable
        rows={forums}
        columns={columns}
        initialSort={{ key: 'date', dir: 'asc' }}
        searchText={(r) => [r.name, r.location, r.website].join(' ')}
        onRowClick={(r) => router.push(`/forums/${r.id}/gantt`)}
        rowClassName={(r) => (r.archived ? 'text-ink/50' : undefined)}
        toolbar={
          <Button onClick={() => setEdit('new')}>
            <Plus /> Новый форум
          </Button>
        }
      />
      <ForumFormDialog
        open={edit !== null}
        onOpenChange={(o) => !o && setEdit(null)}
        forum={edit === 'new' || edit === null ? undefined : edit}
        forumOptions={options}
      />
    </>
  );
}
