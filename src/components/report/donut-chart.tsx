'use client';

import * as React from 'react';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import {
  chartTotal,
  computeSegments,
  formatPct,
  layoutLabels,
  type ChartItem,
} from '@/lib/report/donut-layout';
import type { PaletteKey } from '@/lib/report/palette';
import { formatAmount } from '@/lib/utils';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null);
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Кольцевая диаграмма с итогом в центре, выносками и легендой. */
export function DonutChart({
  items,
  palette,
  unit,
  height = 380,
}: {
  items: ChartItem[];
  palette: PaletteKey;
  unit: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [animated, setAnimated] = React.useState(false);
  const segments = React.useMemo(() => computeSegments(items, palette), [items, palette]);
  const total = chartTotal(items);
  const narrow = width < 520;
  const H = narrow ? 300 : height;
  const labelSpace = narrow ? 0 : Math.min(170, width * 0.28);
  const outerR = Math.max(60, Math.min(H / 2 - 36, (width - 2 * labelSpace) / 2 - 20));
  const innerR = outerR * 0.72;
  const cx = width / 2;
  const cy = H / 2;
  const labels = React.useMemo(
    () =>
      narrow || width === 0
        ? []
        : layoutLabels(segments, {
            cx,
            cy,
            outerR,
            elbow: 18,
            shelf: 12,
            lineHeight: 14,
            gap: 4,
            maxChars: Math.max(14, Math.floor((labelSpace - 20) / 6.6)),
            top: 6,
            bottom: H - 6,
            formatAmount,
          }),
    [segments, cx, cy, outerR, H, narrow, width, labelSpace],
  );

  // Подписи появляются после анимации кольца
  React.useEffect(() => {
    setAnimated(false);
    const t = setTimeout(() => setAnimated(true), 900);
    return () => clearTimeout(t);
  }, [items, palette, width]);

  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      {width > 0 && segments.length > 0 && (
        <>
          <PieChart width={width} height={H}>
            <Pie
              data={segments}
              dataKey="amount"
              nameKey="name"
              cx={cx}
              cy={cy}
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
                const p =
                  active && (payload?.[0]?.payload as (typeof segments)[number] | undefined);
                if (!p) return null;
                return (
                  <div className="rounded-md border border-line bg-white px-3 py-2 text-xs shadow-md">
                    <div className="flex items-center gap-1.5 font-medium">
                      <span className="size-2.5 rounded-sm" style={{ background: p.color }} />{' '}
                      {p.name}
                    </div>
                    <div className="mt-1">
                      {formatAmount(p.amount)} {unit} · {formatPct(p.pct)}
                    </div>
                  </div>
                );
              }}
            />
          </PieChart>
          <svg
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            width={width}
            height={H}
            style={{ opacity: animated ? 1 : 0 }}
            aria-hidden
          >
            {labels.map((l) => (
              <g key={l.segment.index}>
                <polyline
                  points={`${l.p0.x},${l.p0.y} ${l.p1.x},${l.p1.y} ${l.p2.x},${l.p2.y}`}
                  fill="none"
                  stroke="#8A94A6"
                  strokeWidth={1}
                />
                <circle cx={l.p0.x} cy={l.p0.y} r={2} fill="#8A94A6" />
                {l.lines.map((line, i) => (
                  <text
                    key={i}
                    x={l.align === 'left' ? l.p2.x + 4 : l.p2.x - 4}
                    y={l.textY + 11 + i * 14}
                    textAnchor={l.align === 'left' ? 'start' : 'end'}
                    fontSize={i === l.lines.length - 1 ? 11 : 12}
                    fill={i === l.lines.length - 1 ? '#8A94A6' : '#111111'}
                  >
                    {line}
                  </text>
                ))}
              </g>
            ))}
          </svg>
          <div
            className="pointer-events-none absolute flex flex-col items-center justify-center text-center"
            style={{ left: cx - innerR, top: cy - innerR, width: innerR * 2, height: innerR * 2 }}
          >
            <span
              className="font-bold leading-none text-ink"
              style={{ fontSize: Math.max(22, innerR * 0.34) }}
            >
              {formatAmount(total)}
            </span>
            <span className="mt-1 text-sm text-ink/70">{unit}</span>
          </div>
        </>
      )}
      {segments.length === 0 && (
        <div className="flex h-full items-center justify-center rounded-md border border-dashed border-line text-sm text-status-gray">
          Нет данных — добавьте строки с суммами
        </div>
      )}
    </div>
  );
}

/** Легенда справа: цвет, название, сумма, доля. */
export function ChartLegend({ items, palette }: { items: ChartItem[]; palette: PaletteKey }) {
  const segments = computeSegments(items, palette);
  return (
    <ul className="space-y-1.5 text-sm">
      {segments.map((s) => (
        <li key={s.index} className="flex items-start gap-2">
          <span className="mt-1 size-3 shrink-0 rounded-sm" style={{ background: s.color }} />
          <span className="flex-1 leading-snug">{s.name}</span>
          <span className="whitespace-nowrap tabular-nums">{formatAmount(s.amount)}</span>
          <span className="w-12 whitespace-nowrap text-right text-xs tabular-nums text-ink/60">
            {formatPct(s.pct)}
          </span>
        </li>
      ))}
    </ul>
  );
}
