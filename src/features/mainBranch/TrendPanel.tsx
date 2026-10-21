import { useEffect, useRef, useState } from "react";
import { formatNumber, formatPercent } from "../../lib/format";
import { countLessons } from "./metrics";

export interface TrendPoint {
  label: string;
  title: string;
  /** null — занять з дітьми не було: розрив, а не нуль */
  rate: number | null;
  lessons: number;
  present: number;
  expected: number;
}

const PAD_L = 40;
const PAD_R = 12;

/** Динаміка мережі: відвідуваність (шкала 0–100 %) і кількість проведених занять (своя шкала) —
    два компактні графіки зі спільною віссю дат і спільною підказкою; під ними — таблиця для читачів екрана. */
export function TrendPanel({ points, loading }: { points: TrendPoint[]; loading: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
    // Під час завантаження контейнера ще немає — підписуємось, щойно графік з'явиться.
  }, [loading, points.length === 0]);

  const n = points.length;
  const innerW = width - PAD_L - PAD_R;
  const x = (i: number) => PAD_L + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const rateH = 132;
  // Стовпчики занять — достатньо високі, щоб 1 заняття було помітним (бриф §6: окремий чіткий масштаб).
  const barsH = 78;
  const yRate = (v: number) => 8 + (1 - v / 100) * (rateH - 16);
  const maxLessons = Math.max(1, ...points.map((p) => p.lessons));
  const niceMax = maxLessons <= 5 ? 5 : Math.ceil(maxLessons / 5) * 5;
  // Проміжна поділка шкали занять — щоб другий масштаб читався без підказки.
  const barTicks = niceMax % 2 === 0 ? [0, niceMax / 2, niceMax] : [0, niceMax];
  const yBar = (v: number) => 6 + (1 - v / niceMax) * (barsH - 12);
  const barW = Math.max(2, Math.min(16, (innerW / Math.max(1, n)) * 0.6));
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 64))));

  // Лінія з розривами на днях без занять
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.rate === null) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    } else current.push(`${x(i).toFixed(1)},${yRate(p.rate).toFixed(1)}`);
  });
  if (current.length) segments.push(current.join(" "));

  const pick = (clientX: number, rect: DOMRect) => {
    const rel = clientX - rect.left - PAD_L;
    const i = n <= 1 ? 0 : Math.round((rel / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const h = hover !== null ? points[hover] : null;

  if (loading) return <div className="nd-chart-box"><span className="nd-skel" style={{ width: "100%", height: 200 }} /></div>;
  if (n === 0) return <div className="nd-empty">За період немає даних</div>;

  return (
    <div className="nd-chart-box" ref={boxRef}>
      <div className="nd-legend" aria-hidden="true">
        <span><i className="nd-key line" /> Відвідуваність, %</span>
        <span><i className="nd-key bar" /> Проведено занять</span>
      </div>
      <div
        className="nd-chart-hit"
        onMouseMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => pick(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
      >
        <svg width={width} height={rateH} role="img" aria-label="Відвідуваність по мережі за період">
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={PAD_L} x2={width - PAD_R} y1={yRate(v)} y2={yRate(v)} className="nd-grid" />
              <text x={PAD_L - 8} y={yRate(v) + 4} className="nd-axis" textAnchor="end">{v}%</text>
            </g>
          ))}
          {segments.map((s, i) => <polyline key={i} points={s} className="nd-line" />)}
          {points.map((p, i) => (p.rate !== null && (n <= 31 || i === hover) ? (
            <circle key={i} cx={x(i)} cy={yRate(p.rate)} r={i === hover ? 5 : 3} className="nd-dot-pt" />
          ) : null))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={4} y2={rateH - 4} className="nd-cross" />}
        </svg>
        <svg width={width} height={barsH + 22} role="img" aria-label="Кількість проведених занять за період">
          {barTicks.map((v) => (
            <g key={v}>
              <line x1={PAD_L} x2={width - PAD_R} y1={yBar(v)} y2={yBar(v)} className="nd-grid" />
              <text x={PAD_L - 8} y={yBar(v) + 4} className="nd-axis" textAnchor="end">{v}</text>
            </g>
          ))}
          {points.map((p, i) => (
            <rect
              key={i}
              x={x(i) - barW / 2}
              y={yBar(p.lessons)}
              width={barW}
              height={Math.max(0, yBar(0) - yBar(p.lessons))}
              rx={Math.min(3, barW / 2)}
              className={`nd-bar${i === hover ? " on" : ""}`}
            />
          ))}
          {points.map((p, i) => (i % labelEvery === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={barsH + 16} className="nd-axis" textAnchor="middle">{p.label}</text>
          ) : null))}
        </svg>
        {h && (
          <div className="nd-tip" style={{ left: Math.min(Math.max(x(hover!), 90), width - 90) }} role="status">
            <b>{h.title}</b>
            <span>{h.rate === null ? "занять з дітьми не було" : `відвідуваність ${formatPercent(h.rate)} (${formatNumber(h.present)} з ${formatNumber(h.expected)})`}</span>
            <span>{countLessons(h.lessons)} проведено</span>
          </div>
        )}
      </div>
      <details className="nd-table-alt">
        <summary>Показати таблицею</summary>
        <table className="nd-table compact">
          <thead><tr><th>Дата</th><th className="r">Відвідуваність</th><th className="r">Присутні / очікувані</th><th className="r">Занять</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.title}>
                <td>{p.title}</td>
                <td className="r">{p.rate === null ? "—" : formatPercent(p.rate)}</td>
                <td className="r">{formatNumber(p.present)} / {formatNumber(p.expected)}</td>
                <td className="r">{formatNumber(p.lessons)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
