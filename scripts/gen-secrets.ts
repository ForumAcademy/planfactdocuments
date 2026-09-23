/**
 * Выводит готовые значения секретов: SESSION_SECRET, CRON_SECRET и хеш пароля.
 * Использование: npm run gen-secrets -- "мой пароль"
 */
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

async function main() {
  let password = process.argv[2];
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question('Придумайте пароль для входа на сайт (не короче 8 символов): ');
    rl.close();
  }
  if (!password || password.length < 8) {
    console.error('Пароль должен быть не короче 8 символов.');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  const session = randomBytes(32).toString('base64url');
  const cron = randomBytes(24).toString('base64url');

  console.log('\n=== Для Vercel (Settings → Environment Variables), копируйте как есть ===');
  console.log(`APP_PASSWORD_HASH=${hash}`);
  console.log(`SESSION_SECRET=${session}`);
  console.log(`CRON_SECRET=${cron}`);
  console.log('\n=== Для локального файла .env ($ в хеше экранированы) ===');
  console.log(`APP_PASSWORD_HASH=${hash.replace(/\$/g, '\\$')}`);
  console.log(`SESSION_SECRET=${session}`);
  console.log(`CRON_SECRET=${cron}`);
  console.log('\nПароль храните отдельно: в коде и в БД он не сохраняется.');
}

main();
