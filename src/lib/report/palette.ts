export type PaletteKey = 'RED' | 'GREEN' | 'BLUE';

export const PALETTES: Record<PaletteKey, { label: string; dark: string; light: string }> = {
  RED: { label: 'Красная', dark: '#7F1D1D', light: '#FCA5A5' },
  GREEN: { label: 'Зелёная', dark: '#14532D', light: '#86EFAC' },
  BLUE: { label: 'Синяя', dark: '#060670', light: '#93C5FD' },
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** n оттенков от тёмного к светлому (первый — самый тёмный). */
export function paletteShades(key: PaletteKey, n: number): string[] {
  const { dark, light } = PALETTES[key];
  if (n <= 0) return [];
  if (n === 1) return [dark.toUpperCase()];
  const a = hexToRgb(dark);
  const b = hexToRgb(light);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  });
}
