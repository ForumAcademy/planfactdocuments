/**
 * Цвета карточек форумов. Красный, жёлтый и зелёный статусов не используются —
 * они обозначают сроки, отклонения и статусы. На тёмных шапках текст белый,
 * на светлых (light: true) — тёмный.
 */
export const FORUM_COLORS = {
  blue: { label: 'Синий', hex: '#0A0A9F', light: false },
  turquoise: { label: 'Бирюзовый', hex: '#35A9B4', light: false },
  indigo: { label: 'Индиго', hex: '#4B1D91', light: false },
  emerald: { label: 'Изумрудный', hex: '#2E7D6E', light: false },
  cornflower: { label: 'Васильковый', hex: '#5C6BC0', light: false },
  violet: { label: 'Фиолетовый', hex: '#7A5AA6', light: false },
  slate: { label: 'Серо-синий', hex: '#4F6F8F', light: false },
  purpleLight: { label: 'Светло-фиолетовый', hex: '#E7DBFD', light: true },
  amaranthLight: { label: 'Светло-амарантовый', hex: '#F6D1E9', light: true },
  herbalLight: { label: 'Светло-травяной', hex: '#CCF1DE', light: true },
} as const;

export type ForumColor = keyof typeof FORUM_COLORS;

export const FORUM_COLOR_KEYS = Object.keys(FORUM_COLORS) as ForumColor[];

export function forumColor(key: string | null | undefined) {
  return FORUM_COLORS[(key ?? 'blue') as ForumColor] ?? FORUM_COLORS.blue;
}
