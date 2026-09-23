'use client';

import * as React from 'react';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import {
  chartTotal,
  computeSegments,
  formatPct,
  insideLabels,
  type ChartItem,
} from '@/lib/report/donut-layout';
import type { PaletteKey } from '@/lib/report/palette';
import { formatAmount } from '@/lib/utils';

/**
 * Кольцевая диаграмма: итог в центре, доли в процентах внутри сегментов.
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
  const [animated, setAnimated] = React.useState(false);
  const segments = React.useMemo(() => computeSegments(items, palette), [items, palette]);
  const total = chartTotal(items);
  const outerR = size / 2 - 6;
  const innerR = outerR * 0.62;
  const c = size / 2;
  const labels = React.useMemo(
    () => insideLabels(segments, c, c, (innerR + outerR) / 2),
    [segments, c, innerR, outerR],
  );

  // Подписи появляются после анимации кольца
  React.useEffect(() => {
    setAnimated(false);
    const t = setTimeout(() => setAnimated(true), 900);
    return () => clearTimeout(t);
  }, [items, palette]);

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
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={segments}
          dataKey="amount"
          nameKey="name"
          cx={c}
          cy={c}
          innerRadius={innerR}
          outerRadius={outerR}
          startAngle={90}
          endAngle={-270}
          stroke="#fff"
          strokeWidth={1.5}
          isAnimationActive
          animationDuration={700}
        >
          {segments.map((s) => (
            <Cell key={s.index} fill={s.color} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            const p = active && (payload?.[0]?.payload as (typeof segments)[number] | undefined);
            if (!p) return null;
            return (
              <div className="rounded-md border border-line bg-white px-3 py-2 text-xs shadow-md">
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="size-2.5 rounded-sm" style={{ background: p.color }} /> {p.name}
                </div>
                <div className="mt-1">
                  {formatAmount(p.amount)} {unit}
                  {p.note ? ` (${p.note})` : ''} · {formatPct(p.pct)}
                </div>
              </div>
            );
          }}
        />
      </PieChart>
      <svg
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        width={size}
        height={size}
        style={{ opacity: animated ? 1 : 0 }}
        aria-hidden
      >
        {labels.map((l) => (
          <text
            key={l.segment.index}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fontWeight={600}
            fill={l.dark ? '#FFFFFF' : '#111111'}
          >
            {l.text}
          </text>
        ))}
      </svg>
      <div
        className="pointer-events-none absolute flex flex-col items-center justify-center text-center"
        style={{ left: c - innerR, top: c - innerR, width: innerR * 2, height: innerR * 2 }}
      >
        <span
          className="font-bold leading-none text-ink"
          style={{ fontSize: Math.max(22, innerR * 0.34) }}
        >
          {formatAmount(total)}
        </span>
        <span className="mt-1 text-sm text-ink/70">{unit}</span>
      </div>
    </div>
  );
}
