/**
 * Цвета карточек форумов. Красный, жёлтый и зелёный статусов не используются —
 * они обозначают сроки, отклонения и статусы.
 * text — цвет текста на шапке; accent — цвет крупной цифры дней на белом фоне.
 */
export const FORUM_COLORS = {
  blue: { label: 'Синий', hex: '#0A0A9F', text: '#FFFFFF', accent: '#0A0A9F' },
  turquoise: { label: 'Голубой', hex: '#32AAB5', text: '#FFFFFF', accent: '#2B95A0' },
  indigo: { label: 'Индиго', hex: '#4B1D91', text: '#FFFFFF', accent: '#4B1D91' },
  purple: { label: 'Фиолетовый', hex: '#8E0F9C', text: '#FFFFFF', accent: '#8E0F9C' },
  magenta: { label: 'Пурпурный', hex: '#BF219A', text: '#FFFFFF', accent: '#BF219A' },
  pink: { label: 'Розовый', hex: '#E54787', text: '#FFFFFF', accent: '#E54787' },
  coral: { label: 'Коралловый', hex: '#F27B68', text: '#FFFFFF', accent: '#E0604B' },
  orange: { label: 'Оранжевый', hex: '#F1AA60', text: '#1F1F1F', accent: '#D98A3A' },
  ocean: { label: 'Морской', hex: '#0A5A7B', text: '#FFFFFF', accent: '#0A5A7B' },
  teal: { label: 'Бирюзовый', hex: '#12917A', text: '#FFFFFF', accent: '#12917A' },
  mint: { label: 'Мятный', hex: '#DCF3CF', text: '#1F3D33', accent: '#12917A' },
  ice: { label: 'Светло-голубой', hex: '#C7E5E8', text: '#0A3A4F', accent: '#0A5A7B' },
} as const;

export type ForumColor = keyof typeof FORUM_COLORS;

export const FORUM_COLOR_KEYS = Object.keys(FORUM_COLORS) as ForumColor[];

export function forumColor(key: string | null | undefined) {
  return FORUM_COLORS[(key ?? 'blue') as ForumColor] ?? FORUM_COLORS.blue;
}
