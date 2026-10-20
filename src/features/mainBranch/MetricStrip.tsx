import type { ReactNode } from "react";
import { formatCurrency, formatNumber, formatPercent, pluralUk } from "../../lib/format";
import type { MainBranchKpi, TrendsReport } from "./api";
import { Delta, type PanelKind } from "./metrics";

interface Props {
  kpi: MainBranchKpi | undefined;
  series: TrendsReport["series"] | undefined;
  mode: "daily" | "weekly";
  /** Порівнювати нема з чим — у періоді лише сьогоднішній день, що ще триває. */
  noCompare: boolean;
  onOpen: (kind: PanelKind) => void;
}

/** Чотири головні показники періоду одним рядком: число, зміна, міні-графік за той самий період.
    Кожна колонка — кнопка «Переглянути по філіях». */
export function MetricStrip({ kpi, series, mode, noCompare, onOpen }: Props) {
  const k = kpi;
  const pts = series ? (mode === "daily" ? series.daily : series.weekly) : [];
  const step = mode === "daily" ? "по днях" : "по тижнях";
  const attDelta = k?.comparison.attendance_rate_pct?.delta_percentage_points;
  const payDelta = k?.comparison.payroll_total_uah?.delta_percent;
  const compare = (delta: number | null | undefined, unit: "pp" | "pct", tone: "good" | "neutral"): ReactNode =>
    noCompare ? "порівняємо завтра — день ще триває"
      : delta === null || delta === undefined ? "немає з чим порівняти"
        : <><Delta value={delta} unit={unit} tone={tone} /> до попереднього періоду</>;

  return (
    <div className="nd-strip" role="group" aria-label="Основні показники за період">
      <Metric
        label="Діти в базі"
        loading={!k}
        value={k && formatNumber(k.students_total)}
        sub="поточна база на кінець періоду"
        onOpen={() => onOpen("students")}
        foot={k && (
          <button type="button" className={`nd-chip-new${k.students_new > 0 ? " on" : ""}`} onClick={() => onOpen("new")}>
            {k.students_new > 0 ? `+${formatNumber(k.students_new)} ${pluralUk(k.students_new, "нова", "нові", "нових")} за період` : "нових за період немає"}
            <span aria-hidden="true"> →</span>
          </button>
        )}
      />
      <Metric
        label="Проведено занять"
        loading={!k}
        value={k && <>{formatNumber(k.lessons_completed)}<small> з {formatNumber(k.lessons_scheduled)}</small></>}
        sub={k && (
          k.lessons_unmarked_overdue > 0
            ? <><span className="nd-warn-text">{formatNumber(k.lessons_unmarked_overdue)} не відмічено</span>{k.lessons_upcoming > 0 && <> · {formatNumber(k.lessons_upcoming)} попереду</>}</>
            : <>усі відмічено{k.lessons_upcoming > 0 && <> · {formatNumber(k.lessons_upcoming)} попереду</>}</>
        )}
        onOpen={() => onOpen("lessons")}
        foot={<Spark kind="bars" values={pts.map((p) => p.lessons)} label={`Проведено занять ${step}`} format={(v) => formatNumber(v)} />}
      />
      <Metric
        label="Відвідуваність"
        loading={!k}
        value={k && (k.attendance_has_data ? formatPercent(k.attendance_rate_pct) : "—")}
        sub={k && (k.attendance_has_data ? compare(attDelta, "pp", "good") : "занять з дітьми не було")}
        onOpen={() => onOpen("attendance")}
        foot={<Spark kind="line" values={pts.map((p) => (p.attendance_rate_pct === null ? null : Number(p.attendance_rate_pct)))} label={`Відвідуваність ${step}`} format={(v) => formatPercent(v)} />}
      />
      <Metric
        label="Нараховано зарплат"
        loading={!k}
        value={k && `${formatCurrency(k.payroll_total_uah)} ₴`}
        sub={k && compare(payDelta, "pct", "neutral")}
        onOpen={() => onOpen("payroll")}
        foot={<Spark kind="bars" values={pts.map((p) => Number(p.payroll_uah))} label={`Нараховано ${step}`} format={(v) => `${formatCurrency(v)} ₴`} />}
      />
    </div>
  );
}

function Metric({ label, value, sub, foot, loading, onOpen }: {
  label: string; value: ReactNode; sub: ReactNode; foot: ReactNode; loading: boolean; onOpen: () => void;
}) {
  return (
    <div className="nd-metric">
      <button type="button" className="nd-metric-main" onClick={onOpen}>
        <span className="nd-metric-label">{label}</span>
        {loading ? <span className="nd-skel" style={{ width: 120, height: 34 }} /> : <span className="nd-metric-value num">{value}</span>}
        <span className="nd-metric-sub">{loading ? <span className="nd-skel" style={{ width: 160, height: 14 }} /> : sub}</span>
        <span className="nd-metric-go">Переглянути по філіях →</span>
      </button>
      <div className="nd-metric-foot">
        {loading ? <span className="nd-skel" style={{ width: "100%", height: 32 }} /> : foot}
      </div>
    </div>
  );
}

const W = 160;
const H = 32;

/** Міні-графік за період: лінія (з розривами на днях без занять) або стовпчики.
    Текстова альтернатива — діапазон значень у підписі. */
function Spark({ values, kind, label, format }: {
  values: (number | null)[]; kind: "line" | "bars"; label: string; format: (v: number) => string;
}) {
  const nums = values.filter((v): v is number => v !== null);
  if (values.length === 0 || nums.length === 0) return <span className="nd-spark-empty">за період даних немає</span>;
  const n = values.length;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const title = `${label}: від ${format(min)} до ${format(max)}`;

  if (kind === "bars") {
    const top = Math.max(1, max);
    const slot = W / n;
    const bw = Math.max(1.5, slot * 0.62);
    return (
      <svg className="nd-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={title}>
        <title>{title}</title>
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="nd-spark-base" />
        {values.map((v, i) => {
          if (!v) return null;
          const h = Math.max(1.5, (v / top) * (H - 3));
          return <rect key={i} x={i * slot + (slot - bw) / 2} y={H - 1 - h} width={bw} height={h} className="nd-spark-bar" />;
        })}
      </svg>
    );
  }

  // Шкала лінії — навколо реальних значень, а не 0–100: інакше коливання 70–85 % стане рискою.
  const lo = Math.max(0, Math.floor(min) - 10);
  const hi = Math.min(100, Math.ceil(max) + 5);
  const span = Math.max(10, hi - lo);
  const x = (i: number) => (n <= 1 ? W / 2 : (i * W) / (n - 1));
  const y = (v: number) => 2 + (1 - (v - lo) / span) * (H - 4);
  const segments: { points: string; single: [number, number] | null }[] = [];
  let cur: string[] = [];
  let curN = 0;
  let last: [number, number] | null = null;
  const flush = () => {
    if (cur.length) segments.push({ points: cur.join(" "), single: curN === 1 ? last : null });
    cur = []; curN = 0; last = null;
  };
  values.forEach((v, i) => {
    if (v === null) { flush(); return; }
    cur.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`); curN += 1; last = [x(i), y(v)];
  });
  flush();
  return (
    <svg className="nd-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={title}>
      <title>{title}</title>
      {segments.map((s, i) => (s.single
        ? <circle key={i} cx={s.single[0]} cy={s.single[1]} r={1.8} className="nd-spark-dot" />
        : <polyline key={i} points={s.points} className="nd-spark-line" />))}
    </svg>
  );
}
