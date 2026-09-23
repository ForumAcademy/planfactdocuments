import 'server-only';
import { createHmac } from 'node:crypto';
import { canLinkButton, splitMessage, tgEscape } from '@/lib/telegram-format';

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
export async function sendTelegram(
  chatId: string | number,
  html: string,
  /** Адрес сайта — под сообщением появится кнопка «Открыть сайт» */
  siteUrl?: string,
): Promise<void> {
  const parts = splitMessage(html);
  // Кнопки-ссылки Telegram принимает только с полным публичным https-адресом
  const button =
    siteUrl && canLinkButton(siteUrl)
      ? { inline_keyboard: [[{ text: 'Открыть сайт', url: siteUrl }]] }
      : undefined;
  for (const [i, part] of parts.entries()) {
    const last = i === parts.length - 1;
    const send = (text: string, markup?: typeof button) =>
      tgApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(markup ? { reply_markup: markup } : {}),
      });
    if (!(button && last)) {
      await send(part);
      continue;
    }
    try {
      await send(part, button);
    } catch (e) {
      // Telegram не принял адрес для кнопки — отправляем без кнопки, ссылкой в тексте,
      // чтобы напоминание всё равно дошло
      if (!/BUTTON/i.test(e instanceof Error ? e.message : '')) throw e;
      console.warn('Telegram отклонил кнопку со ссылкой', JSON.stringify(siteUrl), e);
      await send(`${part}\n\n<a href="${tgEscape(siteUrl!)}">Открыть сайт</a>`);
    }
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
