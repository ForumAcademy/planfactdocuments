import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { runSeed } from '@/server/seed';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Загрузка начальных данных из seed/master-plan.xlsx. Доступно только после входа. */
export async function POST() {
  const session = await getSession();
  if (!session.loggedIn || session.role === 'VIEWER') {
    return NextResponse.json({ error: 'Требуется вход в систему' }, { status: 401 });
  }
  try {
    const file = await readFile(path.join(process.cwd(), 'seed', 'master-plan.xlsx'));
    const s = await runSeed(prisma, file);
    revalidatePath('/', 'layout');
    return NextResponse.json({
      message: `Загружено: этапов ${s.stages}, блоков ${s.blocks}, ролей ${s.roles}, задач мастер-плана ${s.templates}${
        s.demoForumCreated ? `; создан демо-форум «СтройТех’26» (${s.demoTasks} задач)` : ''
      }`,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Не удалось загрузить начальные данные' }, { status: 500 });
  }
}
