import { z } from 'zod';
import { isISODate } from './dates';

export const isoDate = (msg = 'Укажите дату') =>
  z
    .string({ error: msg })
    .min(1, msg)
    .refine((v) => isISODate(v), 'Неверный формат даты');

export const optionalIsoDate = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isISODate(v), 'Неверный формат даты');

/**
 * Адрес сайта: можно ввести без https:// — дополнится.
 * Пусто → null, неверный адрес → undefined.
 */
export function normalizeWebsite(v: string | null | undefined): string | null | undefined {
  const raw = (v ?? '').trim();
  if (!raw) return null;
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || /\s/.test(raw)) {
      return undefined;
    }
    return u.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

export const forumSchema = z
  .object({
    name: z.string().trim().min(1, 'Укажите название форума').max(200, 'Слишком длинное название'),
    startDate: isoDate('Укажите дату начала форума'),
    endDate: optionalIsoDate,
    salesStartDate: isoDate('Укажите дату старта продаж'),
    location: z
      .string()
      .trim()
      .max(300)
      .nullish()
      .transform((v) => v || null),
    website: z
      .string()
      .trim()
      .max(500, 'Слишком длинный адрес')
      .nullish()
      .transform((v) => normalizeWebsite(v))
      .refine((v) => v !== undefined, 'Неверный адрес сайта, пример: https://forum.ru')
      .transform((v) => v ?? null),
  })
  .refine((f) => !f.endDate || f.endDate >= f.startDate, {
    message: 'Дата окончания не может быть раньше даты начала',
    path: ['endDate'],
  })
  .refine((f) => f.salesStartDate <= f.startDate, {
    message: 'Старт продаж должен быть не позже даты форума',
    path: ['salesStartDate'],
  });
export type ForumInput = z.input<typeof forumSchema>;

export const employeeSchema = z.object({
  fullName: z.string().trim().min(1, 'Укажите ФИО').max(200),
  position: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => v || null),
  telegram: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((v) => v || null)
    .refine(
      (v) =>
        v === null ||
        /^@?[A-Za-z0-9_]{3,32}$/.test(v.replace(/^https?:\/\/(www\.)?t(elegram)?\.me\//i, '')),
      'Ник в Telegram — латиница, цифры и «_», например @ivanova',
    ),
  active: z.boolean(),
  roleIds: z.array(z.number().int()).max(50),
});
export type EmployeeInput = z.input<typeof employeeSchema>;

export const nameSchema = z.string().trim().min(1, 'Укажите название').max(200);
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Цвет в формате #RRGGBB');

/** Первое сообщение об ошибке zod. */
export function firstZodError(e: z.ZodError): string {
  return e.issues[0]?.message ?? 'Ошибка проверки данных';
}

/** Ошибки по полям для форм. */
export function fieldErrors(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const k = issue.path.join('.');
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}
