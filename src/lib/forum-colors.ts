/**
 * Цвета карточек форумов. Красный, жёлтый и зелёный не используются —
 * они обозначают сроки, отклонения и статусы.
 */
export const FORUM_COLORS = {
  blue: { label: 'Синий', hex: '#0A0A9F', soft: '#E8E8F7' },
  violet: { label: 'Фиолетовый', hex: '#7C3AED', soft: '#F1EAFE' },
  sky: { label: 'Голубой', hex: '#0EA5E9', soft: '#E3F4FD' },
  pink: { label: 'Розовый', hex: '#DB2777', soft: '#FCE7F2' },
  orange: { label: 'Оранжевый', hex: '#EA580C', soft: '#FDEEE4' },
} as const;

export type ForumColor = keyof typeof FORUM_COLORS;

export const FORUM_COLOR_KEYS = Object.keys(FORUM_COLORS) as ForumColor[];

export function forumColor(key: string | null | undefined) {
  return FORUM_COLORS[(key ?? 'blue') as ForumColor] ?? FORUM_COLORS.blue;
}
