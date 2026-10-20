import type { ReactNode } from "react";
import { formatCurrency, formatNumber, formatPercent, formatRangeShort, pluralUk } from "../../lib/format";
import { IconCheck } from "../../lib/icons";
import { ANOMALY_LABELS, UNMARKED_LESSON, type AttentionItem, type BranchRow, type TrendBranch } from "./api";
import { Delta, networkTotals, type Panel, type PanelKind } from "./metrics";

const SHOWN_SIGNALS = 2;

interface Props {
  rows: BranchRow[];
  /** Сигнали уваги за обраний період (невідмічені уроки тут не показуємо — вони окремим числом з рядка філії). */
  attentionItems: AttentionItem[];
  /** Динаміка відвідуваності по філіях з `trends.series.by_branch`; undefined — ще вантажиться. */
  trendsByBranch: TrendBranch[] | undefined;
  mode: "daily" | "weekly";
  loading: boolean;
  canEnter: boolean;
  busyId: number | null;
  onOpen: (panel: Panel) => void;
  onEnter: (row: BranchRow) => void;
}

/** Картки філій — головний блок: кожна філія окремо, з тими самими показниками, що й у мережі,
    і з переходами в ті самі панелі, але лише для цієї філії. */
export function BranchCards({ rows, attentionItems, trendsByBranch, mode, loading, canEnter, busyId, onOpen, onEnter }: Props) {
  const net = networkTotals(rows);
  const sorted = [...rows].sort((a, b) => b.students_total - a.students_total);

  if (loading && rows.length === 0) {
    return (
      <div className="nd-bcards" aria-busy="true">
        {[0, 1, 2].map((i) => <div key={i} className="nd-bcard nd-bcard-skel"><span className="nd-skel" style={{ width: "60%" }} /><span className="nd-skel" style={{ width: "100%", height: 120 }} /></div>)}
      </div>
    );
  }
  if (rows.length === 0) return <div className="nd-card nd-empty">У вибраних немає активних філій</div>;

  return (
    <div className="nd-bcards">
      {sorted.map((r) => {
        const open = (kind: PanelKind) => () => onOpen({ kind, branch: r.tenant_id, scope: "period" });
        // Сигнали періоду містять і кожен невідмічений урок окремо — їх показуємо одним числом з рядка філії.
        const signals = attentionItems.filter((it) => it.tenant_id === r.tenant_id && it.anomaly_type !== UNMARKED_LESSON);
        const extra = Math.max(0, signals.length - SHOWN_SIGNALS);
        const calm = r.lessons_unmarked_overdue === 0 && signals.length === 0;
        const share = rows.length > 1 && net.students_total > 0 ? Math.round((r.students_total / net.students_total) * 100) : null;
        const trend = trendsByBranch?.find((t) => t.tenant_id === r.tenant_id);
        const series = trend ? (mode === "daily" ? trend.daily.map((d) => ({ label: d.date, rate: d.attendance_rate_pct })) : trend.weekly.map((w) => ({ label: w.week_start, rate: w.attendance_rate_pct }))) : null;

        return (
          <article key={r.tenant_id} className="nd-bcard" aria-labelledby={`nd-bcard-${r.tenant_id}`}>
            <header className="nd-bcard-head">
              <div className="nd-bcard-title">
                <button type="button" className="nd-bcard-name" id={`nd-bcard-${r.tenant_id}`} onClick={open("branch")}>
                  {r.tenant_name}
                  <span className="nd-bcard-hint">Огляд філії →</span>
                </button>
                <span className="nd-bcard-meta">{formatNumber(r.teachers_total)} {pluralUk(r.teachers_total, "працівник", "працівники", "працівників")}</span>
              </div>
              <div className="nd-bcard-badges">
                {calm ? (
                  <span className="nd-badge ok"><IconCheck /> усе гаразд</span>
                ) : (
                  <>
                    {r.lessons_unmarked_overdue > 0 && (
                      <button type="button" className="nd-badge warn" onClick={open("unmarked")}>{formatNumber(r.lessons_unmarked_overdue)} не відмічено</button>
                    )}
                    {signals.slice(0, SHOWN_SIGNALS).map((it, i) => (
                      <button key={i} type="button" className={`nd-badge ${it.severity === "critical" || it.severity === "high" ? "risk" : "warn"}`}
                        title={it.summary}
                        onClick={open(it.anomaly_type === "ATTENDANCE_DROP" || it.anomaly_type === "CHRONIC_ABSENCE_CLUSTER" ? "attendance" : "attention")}>
                        {ANOMALY_LABELS[it.anomaly_type] ?? it.summary}
                      </button>
                    ))}
                    {extra > 0 && (
                      <button type="button" className="nd-badge" onClick={open("attention")}>ще {formatNumber(extra)} {pluralUk(extra, "сигнал", "сигнали", "сигналів")}</button>
                    )}
                  </>
                )}
              </div>
            </header>

            <div className="nd-bcard-grid">
              <Metric label="Діти в базі" branch={r.tenant_name} onOpen={open("students")}
                value={formatNumber(r.students_total)}
                extra={<button type="button" className={`nd-chip-new${r.students_new > 0 ? "" : " zero"}`} onClick={open("new")}>{r.students_new > 0 ? `+${formatNumber(r.students_new)} нових` : "нових немає"}</button>} />
              <Metric label="Проведено занять" branch={r.tenant_name} onOpen={open("lessons")}
                value={<>{formatNumber(r.lessons_completed)}<small> з {formatNumber(r.lessons_scheduled)}</small></>}
                sub={r.lessons_upcoming > 0 ? `${formatNumber(r.lessons_upcoming)} попереду` : undefined}
                extra={r.lessons_unmarked_overdue > 0
                  ? <button type="button" className="nd-pill warn" onClick={open("unmarked")}>{formatNumber(r.lessons_unmarked_overdue)} не відмічено</button>
                  : <span className="nd-pill ok">усі відмічено</span>} />
              <Metric label="Відвідуваність" branch={r.tenant_name} onOpen={open("attendance")}
                value={r.attendance_rate_pct === null ? <span className="nd-muted">немає занять</span> : formatPercent(r.attendance_rate_pct)}
                sub={r.attendance_rate_pct === null ? undefined : r.attendance_change_pp === null ? "немає з чим порівняти" : <><Delta value={r.attendance_change_pp} unit="pp" /> в.п.</>}
                extra={series ? <Sparkline series={series} mode={mode} branch={r.tenant_name} /> : trendsByBranch === undefined ? <span className="nd-skel" style={{ width: 120, height: 28 }} /> : null} />
              <Metric label="Нараховано зарплат" branch={r.tenant_name} onOpen={open("payroll")}
                value={`${formatCurrency(r.payroll_uah)} ₴`}
                sub="за заняття й бонуси" />
            </div>

            <footer className="nd-bcard-foot">
              {share !== null ? (
                <div className="nd-share" title={`${formatNumber(r.students_total)} з ${formatNumber(net.students_total)} дітей мережі`}>
                  <span className="nd-share-bar" aria-hidden="true"><i style={{ width: `${share}%` }} /></span>
                  <span className="nd-share-text">{share} % дітей мережі</span>
                </div>
              ) : <span />}
              {canEnter && (
                <button type="button" className="btn ghost sm nd-bcard-work" disabled={busyId !== null} onClick={() => onEnter(r)}>
                  {busyId === r.tenant_id ? "Переходимо…" : "Працювати у філії"}
                </button>
              )}
            </footer>
          </article>
        );
      })}
    </div>
  );
}

/** Міні-показник філії: кнопка відкриває той самий показник, але лише для цієї філії. */
function Metric({ label, branch, value, sub, extra, onOpen }: {
  label: string; branch: string; value: ReactNode; sub?: ReactNode; extra?: ReactNode; onOpen: () => void;
}) {
  return (
    <div className="nd-metric">
      <button type="button" className="nd-metric-main" onClick={onOpen} aria-label={`${label}: ${branch}`}>
        <span className="nd-metric-label">{label}</span>
        <span className="nd-metric-value">{value}</span>
        {sub && <span className="nd-metric-sub">{sub}</span>}
      </button>
      {extra && <div className="nd-metric-extra">{extra}</div>}
    </div>
  );
}

const SPARK_W = 150;
const SPARK_H = 30;

/** Спарклайн відвідуваності: шкала 0–100 %; дні (тижні) без занять з дітьми пропущено — це не нуль.
    Лише натяк на тенденцію; точні значення — у графіку мережі й у панелі філії. */
function Sparkline({ series, mode, branch }: { series: { label: string; rate: number | null }[]; mode: "daily" | "weekly"; branch: string }) {
  const points = series.filter((p): p is { label: string; rate: number } => p.rate !== null);
  const n = points.length;
  if (series.length === 0) return null;
  const first = series[0].label;
  const last = series[series.length - 1].label;
  const range = formatRangeShort(first, last);
  if (n === 0) return <span className="nd-spark-none">{range}: занять з дітьми не було</span>;
  const x = (i: number) => (n <= 1 ? SPARK_W / 2 : (i * (SPARK_W - 6)) / (n - 1) + 3);
  const y = (v: number) => 3 + (1 - v / 100) * (SPARK_H - 6);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join(" ");
  const min = Math.min(...points.map((p) => p.rate));
  const max = Math.max(...points.map((p) => p.rate));
  const text = `${mode === "daily" ? "по днях" : "по тижнях"} ${range}: від ${formatPercent(min, 0)} до ${formatPercent(max, 0)}, останнє ${formatPercent(points[n - 1].rate, 0)}; дні без занять пропущено`;
  return (
    <svg className="nd-spark" width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} role="img" aria-label={`Відвідуваність ${branch} ${text}`}>
      <title>{`Відвідуваність ${text}`}</title>
      <polyline points={line} className="nd-spark-line" />
      <circle cx={x(n - 1)} cy={y(points[n - 1].rate)} r={2.75} className="nd-spark-dot" />
    </svg>
  );
}
