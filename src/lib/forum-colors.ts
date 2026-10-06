/**
 * Цвета карточек форумов. Красный, жёлтый и зелёный статусов не используются —
 * они обозначают сроки, отклонения и статусы. Текст на шапке — белый.
 */
export const FORUM_COLORS = {
  blue: { label: 'Синий', hex: '#0A0A9F' },
  turquoise: { label: 'Бирюзовый', hex: '#32AAB5' },
  indigo: { label: 'Индиго', hex: '#4B1D91' },
  emerald: { label: 'Изумрудный', hex: '#2E7D6E' },
  cornflower: { label: 'Васильковый', hex: '#5C6BC0' },
  mustard: { label: 'Горчичный', hex: '#D89A2B' },
  violet: { label: 'Фиолетовый', hex: '#7A5AA6' },
  slate: { label: 'Серо-синий', hex: '#4F6F8F' },
} as const;

export type ForumColor = keyof typeof FORUM_COLORS;

export const FORUM_COLOR_KEYS = Object.keys(FORUM_COLORS) as ForumColor[];

export function forumColor(key: string | null | undefined) {
  return FORUM_COLORS[(key ?? 'blue') as ForumColor] ?? FORUM_COLORS.blue;
}
