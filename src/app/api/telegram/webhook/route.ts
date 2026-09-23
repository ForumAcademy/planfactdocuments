import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { normalizeTgUsername, tgEscape } from '@/lib/telegram-format';
import { getSettings } from '@/server/reminders';
import { groupConnectCode, sendTelegram, webhookSecret } from '@/server/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TgUpdate {
  message?: {
    text?: string;
    chat: { id: number; type: 'private' | 'group' | 'supergroup' | 'channel'; title?: string };
    from?: { id: number; username?: string; first_name?: string };
  };
  my_chat_member?: {
    chat: { id: number };
    new_chat_member: { status: string };
  };
}

const HELP_PRIVATE =
  'Я присылаю напоминания о задачах подготовки форумов.\n\n' +
  '/start — подключить напоминания\n/stop — отключить напоминания';

/** Вебхук бота Telegram. Защищён секретом в заголовке X-Telegram-Bot-Api-Secret-Token. */
export async function POST(req: NextRequest) {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }
  try {
    await handle(update);
  } catch (e) {
    console.error('telegram webhook', e);
  }
  // Telegram всегда получает 200, иначе будет повторять запрос
  return NextResponse.json({ ok: true });
}

async function handle(update: TgUpdate) {
  // Бота удалили из общего чата
  if (update.my_chat_member) {
    const { chat, new_chat_member } = update.my_chat_member;
    if (['left', 'kicked'].includes(new_chat_member.status)) {
      await prisma.reminderSettings.updateMany({
        where: { telegramGroupChatId: String(chat.id) },
        data: { telegramGroupChatId: null, telegramGroupTitle: null },
      });
    }
    return;
  }
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = String(msg.chat.id);
  const [rawCmd, ...args] = msg.text.trim().split(/\s+/);
  const cmd = rawCmd.split('@')[0].toLowerCase();

  if (msg.chat.type === 'private') {
    if (cmd === '/start') {
      const username = normalizeTgUsername(msg.from?.username);
      if (!username) {
        await sendTelegram(
          chatId,
          'У вас в Telegram не задано имя пользователя (@ник). Задайте его в настройках Telegram, ' +
            'попросите указать этот ник в вашей карточке сотрудника на сайте и снова нажмите /start.',
        );
        return;
      }
      const employees = await prisma.employee.findMany({ where: { telegram: { not: null } } });
      const matched = employees.filter((e) => normalizeTgUsername(e.telegram) === username);
      if (!matched.length) {
        await sendTelegram(
          chatId,
          `Не нашёл сотрудника с ником @${tgEscape(username)}.\n` +
            'Попросите указать этот ник в поле «Telegram» вашей карточки в разделе «База данных → Ответственные», ' +
            'затем снова нажмите /start.',
        );
        return;
      }
      await prisma.employee.updateMany({
        where: { id: { in: matched.map((e) => e.id) } },
        data: { telegramChatId: chatId },
      });
      await sendTelegram(
        chatId,
        `Готово, ${tgEscape(matched.map((e) => e.fullName).join(', '))}! ` +
          'Каждое утро буду присылать ваши задачи: просроченные, со сроком в ближайшие дни и те, которые пора начинать.\n\n' +
          'Отключить: /stop',
      );
      return;
    }
    if (cmd === '/stop') {
      const res = await prisma.employee.updateMany({
        where: { telegramChatId: chatId },
        data: { telegramChatId: null },
      });
      await sendTelegram(
        chatId,
        res.count
          ? 'Напоминания отключены. Включить снова: /start'
          : 'Напоминания и так не подключены.',
      );
      return;
    }
    await sendTelegram(chatId, HELP_PRIVATE);
    return;
  }

  // Общий чат команды
  if (cmd === '/connect') {
    if ((args[0] ?? '').toUpperCase() !== groupConnectCode()) {
      await sendTelegram(
        chatId,
        'Неверный код. Возьмите команду на сайте: «Напоминания» → «Общий чат команды».',
      );
      return;
    }
    await getSettings();
    await prisma.reminderSettings.update({
      where: { id: 1 },
      data: { telegramGroupChatId: chatId, telegramGroupTitle: msg.chat.title ?? null },
    });
    await sendTelegram(
      chatId,
      'Чат подключён. Сюда будет приходить ежедневная сводка по задачам, а по понедельникам — еженедельная.',
    );
    return;
  }
  if (cmd === '/disconnect') {
    const res = await prisma.reminderSettings.updateMany({
      where: { telegramGroupChatId: chatId },
      data: { telegramGroupChatId: null, telegramGroupTitle: null },
    });
    if (res.count) await sendTelegram(chatId, 'Чат отключён от сводок.');
  }
}
