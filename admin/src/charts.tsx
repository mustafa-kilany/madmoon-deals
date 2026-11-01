// The dashboard's charts, in plain SVG (no chart library): columns per day,
// an area line, ranked bars and a segmented bar. Specs follow the data-viz
// rules: one axis, thin marks with 4px rounded data ends, hairline grid, the
// value on hover and keyboard focus, sparing labels, and a table view for every
// chart so nothing depends on color or hovering. Colors: styles.css → .viz.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

// ── Shared pieces ───────────────────────────────────────────────────────────

/** The width the chart has, kept up to date as the window changes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** 0 and 3–4 round steps up to at least `max` (0 / 5 / 10 / 15, 0 / 2K / 4K …); whole steps for counts. */
function niceTicks(max: number, target = 4, whole = true): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  let step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= rough) ?? 10 * power;
  if (whole) step = Math.max(1, Math.ceil(step));
  const ticks = [];
  for (let v = 0; v <= max + step * 0.0001; v += step) ticks.push(Math.round(v * 1000) / 1000);
  if (ticks.at(-1)! < max) ticks.push(ticks.at(-1)! + step);
  return ticks;
}

const compact = (n: number) =>
  n >= 10_000 ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : n.toLocaleString('en');

/** A column / bar path: square at the baseline, 4px rounded at the data end. */
function columnPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (w <= 0) return '';
  const rr = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

/** The hover / focus readout: the value first, then what it is. */
function Tooltip({ x, y, width, value, label }: { x: number; y: number; width: number; value: string; label: string }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div className="viz-tooltip" style={{ left, top: y }} role="status">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/** A chart card: title, a line saying what it shows, and the chart ⇄ table switch. */
export function ChartCard({
  title,
  subtitle,
  table,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  table: { head: string[]; rows: (string | number)[][] };
  children: ReactNode;
  wide?: boolean;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`card box viz${wide ? ' wide-card' : ''}`}>
      <div className="viz-head">
        <div>
          <h2 className="viz-title">{title}</h2>
          {subtitle && <p className="muted small viz-subtitle">{subtitle}</p>}
        </div>
        <button className="link-button" onClick={() => setShowTable(s => !s)} aria-pressed={showTable}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {showTable ? (
        <div className="table-wrap viz-table">
          <table>
            <thead>
              <tr>
                {table.head.map((h, i) => (
                  <th key={h} className={i ? 'num' : undefined}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i} className={i ? 'num' : undefined}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** Arrow keys move along the points; Home / End jump to the ends. */
function useKeyboardIndex(count: number) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = (event: KeyboardEvent) => {
    const keys: Record<string, (i: number) => number> = {
      ArrowRight: i => Math.min(count - 1, i + 1),
      ArrowLeft: i => Math.max(0, i - 1),
      Home: () => 0,
      End: () => count - 1,
    };
    const move = keys[event.key];
    if (!move) return;
    event.preventDefault();
    setActive(i => move(i ?? count - 1));
  };
  return { active, setActive, onKeyDown, onFocus: () => setActive(a => a ?? count - 1), onBlur: () => setActive(null) };
}

export type Point = { label: string; value: number };

const PAD = { top: 18, right: 12, bottom: 26, left: 44 };

/** Short day labels on the x axis: the first, the last and a few between. */
function xLabelIndexes(count: number, width: number) {
  const fit = Math.max(2, Math.floor(width / 90));
  if (count <= fit) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (fit - 1);
  return Array.from({ length: fit }, (_, i) => Math.round(i * step));
}

// ── Columns: one value per day ──────────────────────────────────────────────

/** One series of columns (no legend: the card title names it). The tallest is labeled. */
export function ColumnChart({
  data,
  format = compact,
  axisLabel,
  height = 180,
  description,
}: {
  data: Point[];
  format?: (n: number) => string;
  /** The day as the axis shows it (short). */
  axisLabel: (i: number) => string;
  height?: number;
  description: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const keys = useKeyboardIndex(data.length);
  const ticks = niceTicks(Math.max(...data.map(d => d.value), 0));
  const top = ticks.at(-1)!;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const band = data.length ? plotW / data.length : 0;
  // ≤ 24px, never the whole slot; a 2px surface gap even at 90 days.
  const barW = Math.max(1, Math.min(24, band * 0.7, band - 2));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const maxIndex = data.reduce((best, d, i) => (d.value > data[best]!.value ? i : best), 0);
  const active = keys.active;

  return (
    <div className="viz-plot" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={description}
          tabIndex={0}
          onKeyDown={keys.onKeyDown}
          onFocus={keys.onFocus}
          onBlur={keys.onBlur}
          onPointerLeave={() => keys.setActive(null)}
        >
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'viz-baseline' : 'viz-gridline'} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="viz-tick">
                {format(t)}
              </text>
            </g>
          ))}
          {active !== null && <rect x={PAD.left + active * band} y={PAD.top} width={band} height={plotH} className="viz-band" />}
          {data.map((d, i) => {
            const x = PAD.left + i * band + (band - barW) / 2;
            return (
              <path key={i} d={columnPath(x, y(d.value), barW, y(0) - y(d.value))} className={`viz-mark${active === i ? ' is-active' : ''}`} />
            );
          })}
          {data[maxIndex]!.value > 0 && (
            <text x={PAD.left + maxIndex * band + band / 2} y={y(data[maxIndex]!.value) - 6} textAnchor="middle" className="viz-label">
              {format(data[maxIndex]!.value)}
            </text>
          )}
          {xLabelIndexes(data.length, plotW).map(i => (
            <text key={i} x={PAD.left + i * band + band / 2} y={height - 6} textAnchor="middle" className="viz-tick">
              {axisLabel(i)}
            </text>
          ))}
          {/* Hit areas: the whole day's slot, taller and wider than the bar. */}
          {data.map((_, i) => (
            <rect
              key={i}
              x={PAD.left + i * band}
              y={PAD.top}
              width={band}
              height={plotH}
              className="viz-hit"
              onPointerEnter={() => keys.setActive(i)}
            />
          ))}
        </svg>
      )}
      {active !== null && data[active] && (
        <Tooltip
          x={PAD.left + active * band + band / 2}
          y={Math.max(0, y(data[active]!.value) - 8)}
          width={width}
          value={format(data[active]!.value)}
          label={data[active]!.label}
        />
      )}
    </div>
  );
}

// ── Area line: money over time ──────────────────────────────────────────────

/** One series as a 2px line over a 10% wash; a crosshair finds the day; the last value is labeled. */
export function AreaChart({
  data,
  format,
  tickFormat = compact,
  axisLabel,
  height = 200,
  description,
}: {
  data: Point[];
  format: (n: number) => string;
  tickFormat?: (n: number) => string;
  axisLabel: (i: number) => string;
  height?: number;
  description: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const keys = useKeyboardIndex(data.length);
  const ticks = niceTicks(Math.max(...data.map(d => d.value), 0));
  const top = ticks.at(-1)!;
  const plotW = Math.max(0, width - PAD.left - PAD.right - 40); // room for the end label
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join('');
  const area = data.length ? `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : '';
  const active = keys.active;
  const last = data.length - 1;

  const pick = (clientX: number, svg: SVGSVGElement) => {
    const left = svg.getBoundingClientRect().left;
    const i = Math.round(((clientX - left - PAD.left) / plotW) * (data.length - 1));
    keys.setActive(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <div className="viz-plot" ref={ref}>
      {width > 0 && data.length > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={description}
          tabIndex={0}
          onKeyDown={keys.onKeyDown}
          onFocus={keys.onFocus}
          onBlur={keys.onBlur}
          onPointerMove={e => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => keys.setActive(null)}
        >
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} className={t === 0 ? 'viz-baseline' : 'viz-gridline'} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="viz-tick">
                {tickFormat(t)}
              </text>
            </g>
          ))}
          <path d={area} className="viz-area" />
          <path d={line} className="viz-line" />
          {active !== null && <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} className="viz-crosshair" />}
          <circle cx={x(active ?? last)} cy={y(data[active ?? last]!.value)} r={4} className="viz-dot" />
          <text x={x(last) + 8} y={y(data[last]!.value)} dy="0.32em" className="viz-label">
            {tickFormat(data[last]!.value)}
          </text>
          {xLabelIndexes(data.length, plotW).map(i => (
            <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="viz-tick">
              {axisLabel(i)}
            </text>
          ))}
        </svg>
      )}
      {active !== null && data[active] && (
        <Tooltip x={x(active)} y={Math.max(0, y(data[active]!.value) - 10)} width={width} value={format(data[active]!.value)} label={data[active]!.label} />
      )}
    </div>
  );
}

// ── Ranked bars: compare parts ──────────────────────────────────────────────

/** Largest first, one hue, the value at each bar's tip; past `limit`, the rest fold into "Other". */
export function RankedBars({ data, limit = 8, description }: { data: Point[]; limit?: number; description: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const rows =
    sorted.length > limit
      ? [...sorted.slice(0, limit - 1), { label: `Other (${sorted.length - limit + 1})`, value: sorted.slice(limit - 1).reduce((s, d) => s + d.value, 0) }]
      : sorted;
  const total = rows.reduce((s, d) => s + d.value, 0);
  const max = Math.max(...rows.map(d => d.value), 1);
  const labelW = Math.min(170, Math.max(110, width * 0.36));
  const valueW = 44;
  const barH = 16;
  const rowH = 30;
  const plotW = Math.max(0, width - labelW - valueW);
  const height = rows.length * rowH;

  return (
    <div className="viz-plot" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={description} onPointerLeave={() => setActive(null)}>
          <line x1={labelW} x2={labelW} y1={0} y2={height} className="viz-baseline" />
          {rows.map((d, i) => {
            const w = (d.value / max) * plotW;
            const top = i * rowH + (rowH - barH) / 2;
            return (
              <g key={d.label} onPointerEnter={() => setActive(i)}>
                <rect x={0} y={i * rowH} width={width} height={rowH} className="viz-hit" />
                <text x={labelW - 10} y={top + barH / 2} dy="0.32em" textAnchor="end" className="viz-cat">
                  {d.label.length > 24 ? `${d.label.slice(0, 23)}…` : d.label}
                </text>
                <path d={barPath(labelW, top, w, barH)} className={`viz-mark${active === i ? ' is-active' : ''}`} />
                <text x={labelW + w + 6} y={top + barH / 2} dy="0.32em" className="viz-label">
                  {compact(d.value)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {active !== null && rows[active] && (
        <Tooltip
          x={labelW + (rows[active]!.value / max) * plotW / 2}
          y={active * rowH - 4}
          width={width}
          value={`${rows[active]!.value.toLocaleString('en')} · ${total ? Math.round((rows[active]!.value / total) * 100) : 0}%`}
          label={rows[active]!.label}
        />
      )}
    </div>
  );
}

// ── Segmented bar: one whole, split into parts ──────────────────────────────

export type Part = { label: string; value: number; /** a categorical slot, 1–4 */ slot: 1 | 2 | 3 | 4 };

/** A tall (28px) bar: share printed inside where it fits; the legend names the parts in order. */
export function SegmentedBar({ parts, description, unit }: { parts: Part[]; description: string; unit: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const legendId = useId();
  const total = parts.reduce((s, p) => s + p.value, 0);
  const shown = parts.filter(p => p.value > 0);
  const gap = 2;
  const usable = Math.max(0, width - gap * Math.max(0, shown.length - 1));
  let cursor = 0;
  const blocks = shown.map(p => {
    const w = total ? (p.value / total) * usable : 0;
    const block = { ...p, x: cursor, w, share: total ? Math.round((p.value / total) * 100) : 0 };
    cursor += w + gap;
    return block;
  });

  return (
    <div className="viz-plot" ref={ref}>
      {total === 0 ? (
        <p className="muted small">None in this period.</p>
      ) : (
        width > 0 && (
          <svg width={width} height={28} role="img" aria-label={description} aria-describedby={legendId} onPointerLeave={() => setActive(null)}>
            {blocks.map((b, i) => {
              const label = `${b.share}%`;
              const fits = b.w >= label.length * 7.5 + 14;
              return (
                <g key={b.label} onPointerEnter={() => setActive(i)}>
                  <rect x={b.x} y={0} width={Math.max(b.w, 1)} height={28} rx={4} className={`viz-slot-${b.slot}${active === i ? ' is-active' : ''}`} />
                  {fits && (
                    <text x={b.x + 8} y={14} dy="0.32em" className={`viz-inside${b.slot === 4 ? ' on-light' : ''}`}>
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )
      )}
      {active !== null && blocks[active] && (
        <Tooltip
          x={blocks[active]!.x + blocks[active]!.w / 2}
          y={-6}
          width={width}
          value={`${blocks[active]!.value.toLocaleString('en')} ${unit} · ${blocks[active]!.share}%`}
          label={blocks[active]!.label}
        />
      )}
      <ul className="viz-legend" id={legendId}>
        {parts.map(p => (
          <li key={p.label}>
            <span className={`viz-swatch viz-slot-${p.slot}`} aria-hidden="true" />
            {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
