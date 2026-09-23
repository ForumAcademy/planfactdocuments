'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import type { ISODate } from '@/lib/dates';
import {
  EMPTY_FILTERS,
  filterTasks,
  filtersToQuery,
  parseFilters,
  sortTasks,
  type Filters,
} from '@/lib/filters';
import type { DictsDTO, ForumDTO, TaskDTO } from '@/lib/types';
import {
  bulkUpdateTasks,
  createTask,
  deleteTasks,
  duplicateTask,
  reorderTasks,
  updateTask,
  type TaskPatch,
} from '@/server/actions/tasks';

interface Lookups {
  stage: Map<number, DictsDTO['stages'][number]>;
  block: Map<number, string>;
  role: Map<number, string>;
  employee: Map<number, DictsDTO['employees'][number]>;
}

interface ForumContextValue {
  forum: ForumDTO;
  today: ISODate;
  dicts: DictsDTO;
  lookups: Lookups;
  tasks: TaskDTO[];
  /** Отфильтрованные и отсортированные задачи. */
  visible: TaskDTO[];
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  resetFilters: () => void;
  patchTask: (id: number, patch: TaskPatch, opts?: { silent?: boolean }) => Promise<TaskDTO | null>;
  bulkUpdate: (ids: number[], input: Parameters<typeof bulkUpdateTasks>[1]) => Promise<boolean>;
  addTask: (input: Parameters<typeof createTask>[1]) => Promise<TaskDTO | null>;
  removeTasks: (ids: number[]) => Promise<boolean>;
  duplicate: (id: number) => Promise<void>;
  reorder: (orderedIds: number[]) => Promise<void>;
  openTaskId: number | null;
  setOpenTaskId: (id: number | null) => void;
  saving: boolean;
}

const Ctx = React.createContext<ForumContextValue | null>(null);

export function useForum(): ForumContextValue {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('useForum вне ForumProvider');
  return v;
}

export function ForumProvider({
  forum,
  tasks: initialTasks,
  dicts,
  today,
  children,
}: {
  forum: ForumDTO;
  tasks: TaskDTO[];
  dicts: DictsDTO;
  today: ISODate;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [tasks, setTasks] = React.useState(initialTasks);
  const [openTaskId, setOpenTaskId] = React.useState<number | null>(null);
  const [pending, setPending] = React.useState(0);

  // Данные с сервера обновились (router.refresh) — принимаем их
  React.useEffect(() => setTasks(initialTasks), [initialTasks]);

  const filters = React.useMemo(() => parseFilters(new URLSearchParams(sp.toString())), [sp]);
  const setFilters = React.useCallback(
    (f: Partial<Filters>) => {
      const next = { ...parseFilters(new URLSearchParams(window.location.search)), ...f };
      const q = filtersToQuery(next);
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
  const resetFilters = React.useCallback(() => {
    const cur = parseFilters(new URLSearchParams(window.location.search));
    setFilters({ ...EMPTY_FILTERS, sort: cur.sort, dir: cur.dir });
  }, [setFilters]);

  const lookups = React.useMemo<Lookups>(
    () => ({
      stage: new Map(dicts.stages.map((s) => [s.id, s])),
      block: new Map(dicts.blocks.map((b) => [b.id, b.name])),
      role: new Map(dicts.roles.map((r) => [r.id, r.name])),
      employee: new Map(dicts.employees.map((e) => [e.id, e])),
    }),
    [dicts],
  );

  const visible = React.useMemo(
    () => sortTasks(filterTasks(tasks, filters, today), filters.sort, filters.dir, dicts, today),
    [tasks, filters, today, dicts],
  );

  const track = async <T,>(p: Promise<T>): Promise<T> => {
    setPending((n) => n + 1);
    try {
      return await p;
    } finally {
      setPending((n) => n - 1);
    }
  };

  const replaceTasks = (list: TaskDTO[]) => {
    const byId = new Map(list.map((t) => [t.id, t]));
    setTasks((prev) => prev.map((t) => byId.get(t.id) ?? t));
  };

  const patchTask = React.useCallback(
    async (id: number, patch: TaskPatch, opts?: { silent?: boolean }) => {
      // Оптимистичное обновление простых полей
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const n = { ...t };
          if (patch.status !== undefined) {
            n.status = patch.status;
            n.completedAt = patch.status === 'DONE' ? (t.completedAt ?? today) : null;
          }
          if (patch.startDate !== undefined) n.startDate = patch.startDate ?? null;
          if (patch.endDate !== undefined) n.endDate = patch.endDate ?? null;
          if (patch.description !== undefined) n.description = patch.description;
          if (patch.comment !== undefined) n.comment = patch.comment;
          if (patch.termText !== undefined) n.termText = patch.termText;
          if (patch.employeeIds !== undefined) n.employeeIds = patch.employeeIds;
          if (patch.roleIds !== undefined) n.roleIds = patch.roleIds;
          if (patch.stageId !== undefined) n.stageId = patch.stageId;
          if (patch.blockId !== undefined) n.blockId = patch.blockId;
          return n;
        }),
      );
      const before = tasks.find((t) => t.id === id);
      const res = await track(updateTask(id, patch));
      if (!res.ok) {
        toast.error(res.error);
        if (before) replaceTasks([before]);
        return null;
      }
      replaceTasks([res.data]);
      if (!opts?.silent) toast.success('Сохранено', { id: 'saved' });
      return res.data;
    },
    [tasks, today],
  );

  const bulkUpdate = async (ids: number[], input: Parameters<typeof bulkUpdateTasks>[1]) => {
    const res = await track(bulkUpdateTasks(ids, input));
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    replaceTasks(res.data);
    toast.success(`Изменено задач: ${res.data.length}`);
    return true;
  };

  const addTask = async (input: Parameters<typeof createTask>[1]) => {
    const res = await track(createTask(forum.id, input));
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    setTasks((prev) => {
      const shifted = prev.map((t) =>
        t.order >= res.data.order ? { ...t, order: t.order + 1 } : t,
      );
      return [...shifted, res.data];
    });
    toast.success('Задача добавлена');
    return res.data;
  };

  const removeTasks = async (ids: number[]) => {
    const res = await track(deleteTasks(ids));
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    const set = new Set(ids);
    setTasks((prev) => prev.filter((t) => !set.has(t.id)));
    toast.success(`Удалено задач: ${res.data}`);
    return true;
  };

  const duplicate = async (id: number) => {
    const res = await track(duplicateTask(id));
    if (!res.ok) return void toast.error(res.error);
    setTasks((prev) => [
      ...prev.map((t) => (t.order >= res.data.order ? { ...t, order: t.order + 1 } : t)),
      res.data,
    ]);
    toast.success('Задача продублирована');
  };

  const reorder = async (orderedIds: number[]) => {
    const pos = new Map(orderedIds.map((id, i) => [id, i + 1]));
    setTasks((prev) => prev.map((t) => ({ ...t, order: pos.get(t.id) ?? t.order })));
    const res = await track(reorderTasks(forum.id, orderedIds));
    if (!res.ok) {
      toast.error(res.error);
      router.refresh();
    } else toast.success('Порядок сохранён', { id: 'saved' });
  };

  const value: ForumContextValue = {
    forum,
    today,
    dicts,
    lookups,
    tasks,
    visible,
    filters,
    setFilters,
    resetFilters,
    patchTask,
    bulkUpdate,
    addTask,
    removeTasks,
    duplicate,
    reorder,
    openTaskId,
    setOpenTaskId,
    saving: pending > 0,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
