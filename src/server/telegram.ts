import 'server-only';
import { createHmac } from 'node:crypto';
import { splitMessage } from '@/lib/telegram-format';

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

function hmac(label: string): string {
  const key = `${process.env.TELEGRAM_BOT_TOKEN ?? ''}|${process.env.SESSION_SECRET ?? ''}`;
  return createHmac('sha256', key).update(label).digest('hex');
}

/** Секрет, который Telegram присылает в заголовке вебхука — защищает от поддельных запросов. */
export function webhookSecret(): string {
  return hmac('webhook').slice(0, 48);
}

/** Код для подключения общего чата командой /connect КОД. */
export function groupConnectCode(): string {
  return hmac('group-connect').slice(0, 6).toUpperCase();
}

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export async function tgApi<T = unknown>(
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  const json = (await res.json()) as TgResponse<T>;
  if (!json.ok) throw new Error(json.description || `Telegram: ошибка ${res.status}`);
  return json.result as T;
}

/** Отправка текста (HTML), длинные сообщения делятся на части. */
export async function sendTelegram(chatId: string | number, html: string): Promise<void> {
  for (const part of splitMessage(html)) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: part,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }
}

export async function getBotInfo(): Promise<{ username: string; name: string } | null> {
  if (!telegramConfigured()) return null;
  try {
    const me = await tgApi<{ username: string; first_name: string }>('getMe');
    return { username: me.username, name: me.first_name };
  } catch {
    return null;
  }
}
