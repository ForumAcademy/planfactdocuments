import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Основной сценарий: вход → создание форума → импорт Excel → смена статуса → экспорт PPTX.
 * Пароль берётся из E2E_PASSWORD (тот, хеш которого задан в APP_PASSWORD_HASH).
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'forum2026';

test('вход, создание форума, импорт плана, смена статуса, выгрузка PPTX', async ({ page }) => {
  // Без входа — перенаправление на /login
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  const api = await page.request.get('/api/admin/seed');
  expect(api.status()).toBe(401);

  await page.fill('#password', 'неверный пароль');
  await page.click('button[type=submit]');
  await expect(page.getByTestId('login-error')).toContainText('Неверный пароль');

  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'База данных' }).first()).toBeVisible();

  // Создание форума с пустым планом
  const name = `E2E-форум ${Date.now()}`;
  await page.getByTestId('new-forum').click();
  await page.fill('#f-name', name);
  await page.fill('#f-start', '15.06.2027');
  await page.press('#f-start', 'Tab');
  await expect(page.locator('#f-sales')).toHaveValue('15.02.2027');
  await page.getByLabel('Без задач').check();
  await page.getByRole('button', { name: 'Создать форум' }).click();
  await expect(page).toHaveURL(/\/forums\/\d+\/gantt/);
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // Импорт мастер-плана
  await page.getByTestId('import-plan').click();
  await page.setInputFiles(
    '[data-testid=import-file]',
    path.resolve(__dirname, '../../seed/master-plan.xlsx'),
  );
  await expect(page.getByTestId('import-summary')).toContainText('149');
  await page.getByTestId('import-confirm').click();
  await expect(page.getByText(/План загружен: добавлено 149/)).toBeVisible({ timeout: 60_000 });

  // Список задач
  await page.getByRole('tab', { name: 'Этапы и задачи' }).click();
  await expect(page.getByText('Показано 149 из 149')).toBeVisible();
  const row = page.getByTestId('task-row').first();
  await row.getByTestId('status-cell').click();
  await page.getByRole('button', { name: 'В работе', exact: true }).click();
  await expect(row.getByTestId('status-cell')).toContainText('В работе');
  await expect(page.getByTestId('status-counters')).toContainText('1');

  // Фильтр и поиск
  await page.fill('input[aria-label="Поиск по задачам"]', 'площадк');
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByTestId('task-row').first()).toContainText(/площадк/i);

  // Отчёт и экспорт PPTX
  await page.getByRole('tab', { name: 'Отчёт' }).click();
  await expect(page.getByTestId('report-chart').first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-pptx').click();
  const file = await (await download).path();
  const buf = await readFile(file!);
  expect(buf.subarray(0, 2).toString()).toBe('PK'); // zip-контейнер PPTX
  expect(buf.length).toBeGreaterThan(10_000);
});
