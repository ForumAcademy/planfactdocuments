/**
 * Генерирует bcrypt-хеш пароля для переменной APP_PASSWORD_HASH.
 * Использование: npm run hash-password -- "мой пароль"
 * или без аргумента — пароль будет запрошен в консоли.
 */
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';

async function main() {
  let password = process.argv[2];
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question('Введите пароль для входа на сайт: ');
    rl.close();
  }
  if (!password || password.length < 8) {
    console.error('Пароль должен быть не короче 8 символов.');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  console.log('\nЗначение для Vercel (Settings → Environment Variables):');
  console.log(`APP_PASSWORD_HASH=${hash}`);
  console.log('\nСтрока для локального файла .env (знаки $ экранированы):');
  console.log(`APP_PASSWORD_HASH=${hash.replace(/\$/g, '\\$')}`);
}

main();
