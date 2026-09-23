'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { hasActiveFilters, sortTasks } from '@/lib/filters';
import { isOverdue, lagDays } from '@/lib/status';
import type { TaskDTO } from '@/lib/types';
import { todayMsk } from '@/lib/dates';
import { downloadBlob, safeFileName } from '@/lib/download';
import { useForum } from './forum-context';

export function PlanExportButton() {
  const { forum, tasks, visible, filters, lookups, dicts, today } = useForum();
  const [open, setOpen] = React.useState(false);
  const [scope, setScope] = React.useState<'all' | 'filtered'>('all');
  const [busy, setBusy] = React.useState(false);
  const filtered = hasActiveFilters(filters);

  const run = async () => {
    setBusy(true);
    try {
      const list: TaskDTO[] =
        scope === 'filtered' ? visible : sortTasks(tasks, null, 'asc', dicts, today);
      const { buildPlanWorkbook } = await import('@/lib/excel/plan-excel');
      const buf = await buildPlanWorkbook(
        list.map((t) => ({
          number: t.number,
          stage: t.stageId ? (lookups.stage.get(t.stageId)?.name ?? '') : '',
          block: t.blockId ? (lookups.block.get(t.blockId) ?? '') : '',
          description: t.description,
          termText: t.termText,
          roles: t.roleIds.map((r) => lookups.role.get(r) ?? '').filter(Boolean),
          status: t.status,
          comment: t.comment ?? '',
          employees: t.employeeIds
            .map((e) => lookups.employee.get(e)?.fullName ?? '')
            .filter(Boolean),
          startDate: t.startDate,
          endDate: t.endDate,
          lag: lagDays(t, today),
          completedAt: t.completedAt,
          overdue: isOverdue(t, today),
        })),
        { forumName: forum.name },
      );
      downloadBlob(
        new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `${safeFileName(forum.name)} — план ${todayMsk()}.xlsx`,
      );
      toast.success(`Выгружено задач: ${list.length}`);
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast.error('Не удалось сформировать файл');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => (filtered ? setOpen(true) : run())}
        disabled={busy}
        data-testid="export-plan"
      >
        <Download /> Выгрузить план
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Выгрузить план в Excel">
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                className="accent-brand"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
              />
              Весь план ({tasks.length})
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                className="accent-brand"
                checked={scope === 'filtered'}
                onChange={() => setScope('filtered')}
              />
              Только отфильтрованное ({visible.length})
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button onClick={run} disabled={busy}>
              <Download /> Скачать .xlsx
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
