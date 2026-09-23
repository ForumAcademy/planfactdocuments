import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { runSeed } from '../src/server/seed';

async function main() {
  const prisma = new PrismaClient();
  try {
    const file = await readFile(path.join(process.cwd(), 'seed', 'master-plan.xlsx'));
    const summary = await runSeed(prisma, file);
    console.log('Начальные данные загружены:');
    console.log(`  этапов: ${summary.stages}, блоков: ${summary.blocks}, ролей: ${summary.roles}`);
    console.log(`  задач в типовом мастер-плане: ${summary.templates}`);
    console.log(
      summary.demoForumCreated
        ? `  создан демо-форум «СтройТех’26» (${summary.demoTasks} задач)`
        : '  демо-форум уже существует — пропущен',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
