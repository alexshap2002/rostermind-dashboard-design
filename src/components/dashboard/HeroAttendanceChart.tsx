interface Props {
  labels: string[]; // вже відформатовані підписи осі X ("Чер" або "23.06")
  data: number[]; // відсотки
  loading?: boolean;
}

// Геометрія SVG як у макеті Warm Ink (viewBox 760×190).
const X0 = 55;
const X1 = 705;
const Y_TOP = 20; // 100%
const Y_BOTTOM = 165; // 0%

function yForPct(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return Y_BOTTOM - (clamped / 100) * (Y_BOTTOM - Y_TOP);
}

export function HeroAttendanceChart({ labels, data, loading }: Props) {
  const n = data.length;
  if (n === 0) {
    return (
      <div className="chart-wrap">
        <div className="empty-inline" style={{ color: "#948a78", padding: "40px 0" }}>
          {loading ? "Завантаження…" : "Немає занять у цьому періоді"}
        </div>
      </div>
    );
  }

  // Не більше ~8 підписів на осі; останню точку підписуємо, лише якщо вона не впритул до попередньої.
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const showLabel = (i: number) => i % labelEvery === 0 || (i === n - 1 && (n - 1) % labelEvery >= labelEvery / 2);

  const step = n > 1 ? (X1 - X0) / (n - 1) : 0;
  const xs = data.map((_, i) => X0 + i * step);
  const ys = data.map((v) => yForPct(v));
  const pts = xs.map((x, i) => `${x.toFixed(0)} ${ys[i].toFixed(0)}`);

  const linePath = `M${pts.join(" L")}`;
  const areaPath = `M${pts.join(" L")} L${xs[n - 1].toFixed(0)} ${Y_BOTTOM} L${xs[0].toFixed(0)} ${Y_BOTTOM} Z`;

  const lastX = xs[n - 1];
  const lastY = ys[n - 1];
  const lastVal = data[n - 1];

  const gridYs = [Y_TOP, 55, 95, 135, Y_BOTTOM];

  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox="0 0 760 190"
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Графік відвідуваності"
      >
        <defs>
          <linearGradient id="gh" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f0a276" stopOpacity=".25" />
            <stop offset="1" stopColor="#f0a276" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g stroke="#3a332a">
          {gridYs.map((y) => (
            <line key={y} x1="20" y1={y} x2="745" y2={y} />
          ))}
        </g>
        <path d={areaPath} fill="url(#gh)" />
        <path
          d={linePath}
          fill="none"
          stroke="#f0a276"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g fill="#262019" stroke="#f0a276" strokeWidth="2">
          {xs.slice(0, -1).map((x, i) => (
            <circle key={i} cx={x} cy={ys[i]} r="4" />
          ))}
        </g>
        <circle cx={lastX} cy={lastY} r="5.5" fill="#f0a276" stroke="#262019" strokeWidth="2" />
        <g>
          <rect x={lastX - 29} y={Math.max(lastY - 30, 4)} width="58" height="22" rx="11" fill="#f0a276" />
          <text
            x={lastX}
            y={Math.max(lastY - 15, 19)}
            textAnchor="middle"
            fontSize="12"
            fontWeight="800"
            fill="#262019"
            fontFamily="Commissioner"
          >
            {lastVal.toFixed(1)}%
          </text>
        </g>
        <g fontSize="11" fill="#948a78" textAnchor="middle" fontFamily="Commissioner">
          {labels.map((lbl, i) =>
            showLabel(i) ? (
              <text key={i} x={xs[i]} y="184">{lbl}</text>
            ) : null,
          )}
        </g>
      </svg>
    </div>
  );
}
