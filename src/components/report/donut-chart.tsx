'use client';

import * as React from 'react';
import {
  chartTotal,
  computeSegments,
  formatPct,
  radialLayout,
  sectorPathD,
  type ChartItem,
} from '@/lib/report/donut-layout';
import type { PaletteKey } from '@/lib/report/palette';
import { formatAmount } from '@/lib/utils';

/**
 * Радиальная диаграмма: ширина сектора — доля статьи, длина убывает от крупной статьи
 * к мелкой (спираль). В белом круге в центре — итог, в секторах — проценты.
 * Названия и суммы — в таблице рядом (она же легенда) и во всплывающей подсказке.
 */
export function DonutChart({
  items,
  palette,
  unit,
  size = 320,
}: {
  items: ChartItem[];
  palette: PaletteKey;
  unit: string;
  size?: number;
}) {
  const segments = React.useMemo(() => computeSegments(items, palette), [items, palette]);
  const total = chartTotal(items);
  const c = size / 2;
  const outerR = size / 2 - 4;
  const layout = React.useMemo(() => radialLayout(segments, c, c, outerR), [segments, c, outerR]);
  const [hover, setHover] = React.useState<{ i: number; x: number; y: number } | null>(null);
  const hovered = hover ? layout.sectors[hover.i]?.segment : null;

  if (segments.length === 0) {
    return (
      <div
        className="mx-auto flex items-center justify-center rounded-full border-2 border-dashed border-line text-center text-sm text-status-gray"
        style={{ width: size, height: size }}
      >
        Нет данных —<br />
        добавьте статьи
      </div>
    );
  }

  return (
    <div
      className="relative mx-auto"
      style={{ width: size, height: size }}
      onMouseLeave={() => setHover(null)}
      data-testid="radial-chart"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Диаграмма"
      >
        {layout.rings.map((r) => (
          <circle key={r} cx={c} cy={c} r={r} fill="none" stroke="#E3E7EF" strokeWidth={1} />
        ))}
        <g className="radial-grow" style={{ transformOrigin: `${c}px ${c}px` }}>
          {layout.sectors.map((s, i) => (
            <path
              key={s.segment.index}
              d={sectorPathD(c, c, s.r, s.a0, s.a1)}
              fill={s.segment.color}
              stroke="#fff"
              strokeWidth={1.5}
              className="cursor-default transition-opacity"
              opacity={hover && hover.i !== i ? 0.75 : 1}
              onMouseMove={(e) => {
                const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                setHover({ i, x: e.clientX - box.left, y: e.clientY - box.top });
              }}
            />
          ))}
        </g>
        <circle cx={c} cy={c} r={layout.hole + 2} fill="#000" opacity={0.05} />
        <circle cx={c} cy={c} r={layout.hole} fill="#fff" />
        <g className="radial-labels pointer-events-none">
          {layout.sectors.map(
            (s) =>
              s.label && (
                <text
                  key={s.segment.index}
                  x={s.label.x}
                  y={s.label.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={700}
                  fill={s.label.dark ? '#FFFFFF' : '#111111'}
                >
                  {s.label.text}
                </text>
              ),
          )}
        </g>
      </svg>
      <div
        className="pointer-events-none absolute flex flex-col items-center justify-center text-center"
        style={{
          left: c - layout.hole,
          top: c - layout.hole,
          width: layout.hole * 2,
          height: layout.hole * 2,
        }}
      >
        <span className="font-bold leading-none text-ink" style={{ fontSize: layout.hole * 0.42 }}>
          {formatAmount(total)}
        </span>
        <span className="mt-1 max-w-full truncate px-1 text-xs text-ink/70">{unit}</span>
      </div>
      {hover && hovered && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-[240px] rounded-md border border-line bg-white px-3 py-2 text-xs shadow-md"
          style={{
            left: Math.min(hover.x + 12, size - 120),
            top: hover.y + 12,
          }}
        >
          <div className="flex items-center gap-1.5 font-medium">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: hovered.color }} />
            {hovered.name}
          </div>
          <div className="mt-1">
            {formatAmount(hovered.amount)} {unit}
            {hovered.note ? ` (${hovered.note})` : ''} · {formatPct(hovered.pct)}
          </div>
        </div>
      )}
    </div>
  );
}
