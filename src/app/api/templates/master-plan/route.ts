import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

const FILE_NAME = 'Шаблон мастер-плана.xlsx';

/** Шаблон мастер-плана для загрузки плана форума из Excel (доступен после входа). */
export async function GET() {
  const data = await readFile(path.join(process.cwd(), 'templates', 'master-plan-template.xlsx'));
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="master-plan-template.xlsx"; filename*=UTF-8''${encodeURIComponent(FILE_NAME)}`,
      'Cache-Control': 'no-store',
    },
  });
}
