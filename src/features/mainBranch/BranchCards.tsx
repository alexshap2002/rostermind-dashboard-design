import type { ReactNode } from "react";
import { formatCurrency, formatNumber, formatPercent, formatRangeShort, pluralUk } from "../../lib/format";
import { IconCheck } from "../../lib/icons";
import { ANOMALY_LABELS, UNMARKED_LESSON, type BranchRow, type TrendBranch } from "./api";
import { Delta, NewChip, marksText, networkTotals, signalPanelKind, signalTone, type Panel, type PanelKind, type SignalsState } from "./metrics";

const SHOWN_SIGNALS = 2;

interface Props {
  rows: BranchRow[];
  /** Сигнали уваги за обраний період або стан запиту (невідмічені уроки тут не показуємо — вони окремим числом з рядка філії). */
  signals: SignalsState;
  /** Динаміка відвідуваності по філіях з `trends.series.by_branch`. */
  trendsByBranch: TrendBranch[] | undefined;
  /** Стан запиту динаміки: скелетон — лише поки справді вантажиться. */
  trendsState: "loading" | "ready" | "off";
  mode: "daily" | "weekly";
  /** З чим порівнюємо «зміну» — те саме пояснення, що й у стрічці мережі (у підказці). */
  compareHint: string | null;
  /** Частку дітей показуємо лише для всієї мережі — при фільтрі філій знаменник уже не мережа. */
  allBranches: boolean;
  loading: boolean;
  canEnter: boolean;
  busyId: number | null;
  onOpen: (panel: Panel) => void;
  onEnter: (row: BranchRow) => void;
}

/** Картки філій — головний блок: кожна філія окремо, з тими самими показниками, що й у мережі,
    і з переходами в ті самі панелі, але лише для цієї філії. */
export function BranchCards({ rows, signals, trendsByBranch, trendsState, mode, compareHint, allBranches, loading, canEnter, busyId, onOpen, onEnter }: Props) {
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
        const items = Array.isArray(signals) ? signals.filter((it) => it.tenant_id === r.tenant_id && it.anomaly_type !== UNMARKED_LESSON) : null;
        const extra = items ? Math.max(0, items.length - SHOWN_SIGNALS) : 0;
        // «Усе гаразд» — лише коли сигнали справді завантажено й їх немає; без занять у періоді — інший стан.
        const calm = items !== null && items.length === 0 && r.lessons_unmarked_overdue === 0;
        const share = allBranches && rows.length > 1 && net.students_total > 0 ? Math.round((r.students_total / net.students_total) * 100) : null;
        const trend = trendsByBranch?.find((t) => t.tenant_id === r.tenant_id);
        const series = trend ? (mode === "daily" ? trend.daily.map((d) => ({ label: d.date, rate: d.attendance_rate_pct })) : trend.weekly.map((w) => ({ label: w.week_start, rate: w.attendance_rate_pct }))) : null;
        const lessonsSub = [
          r.lessons_upcoming > 0 ? `${formatNumber(r.lessons_upcoming)} попереду` : null,
          marksText(r),
        ].filter(Boolean).join(" · ");

        return (
          <article key={r.tenant_id} className="nd-bcard" aria-labelledby={`nd-bcard-${r.tenant_id}`}>
            <header className="nd-bcard-head">
              <div className="nd-bcard-title">
                <button type="button" className="nd-bcard-name" id={`nd-bcard-${r.tenant_id}`} onClick={open("branch")}>
                  {r.tenant_name}
                  <span className="nd-bcard-hint">Огляд філії<span aria-hidden="true"> →</span></span>
                </button>
                <span className="nd-bcard-meta">{formatNumber(r.teachers_total)} {pluralUk(r.teachers_total, "працівник", "працівники", "працівників")}</span>
              </div>
              <div className="nd-bcard-badges">
                {r.lessons_unmarked_overdue > 0 && (
                  <button type="button" className="nd-badge warn" onClick={open("unmarked")}>{formatNumber(r.lessons_unmarked_overdue)} не відмічено</button>
                )}
                {items === null ? (
                  signals === "loading" ? <span className="nd-badge" aria-busy="true">сигнали вантажаться…</span>
                    : signals === "error" ? <span className="nd-badge">сигнали не завантажено</span>
                    : null
                ) : (
                  <>
                    {items.slice(0, SHOWN_SIGNALS).map((it, i) => (
                      <button key={i} type="button" className={`nd-badge ${signalTone(it)}`} title={it.summary} onClick={open(signalPanelKind(it))}>
                        {ANOMALY_LABELS[it.anomaly_type] ?? it.summary}
                      </button>
                    ))}
                    {extra > 0 && (
                      <button type="button" className="nd-badge" onClick={open("attention")}>ще {formatNumber(extra)} {pluralUk(extra, "сигнал", "сигнали", "сигналів")}</button>
                    )}
                    {calm && (r.lessons_scheduled > 0
                      ? <span className="nd-badge ok"><IconCheck /> усе гаразд</span>
                      : <span className="nd-badge">занять за період не було</span>)}
                  </>
                )}
              </div>
            </header>

            <div className="nd-bcard-grid">
              <Metric label="Діти в базі" branch={r.tenant_name} onOpen={open("students")}
                value={formatNumber(r.students_total)}
                extra={<NewChip count={r.students_new} onOpen={open("new")} />} />
              <Metric label="Проведено занять" branch={r.tenant_name} onOpen={open("lessons")}
                value={r.lessons_scheduled > 0 ? <>{formatNumber(r.lessons_completed)}<small> з {formatNumber(r.lessons_scheduled)}</small></> : "0"}
                sub={lessonsSub || undefined} />
              <Metric label="Відвідуваність" branch={r.tenant_name} onOpen={open("attendance")}
                value={r.attendance_rate_pct === null ? <span className="nd-muted">немає занять</span> : formatPercent(r.attendance_rate_pct)}
                sub={r.attendance_rate_pct === null ? undefined : r.attendance_change_pp === null ? "немає з чим порівняти"
                  : <><Delta value={r.attendance_change_pp} unit="pp" /> <span className="nd-delta-sfx">до попереднього</span></>}
                subTitle={compareHint ?? undefined}
                extra={series ? <Sparkline series={series} mode={mode} branch={r.tenant_name} />
                  : trendsState === "loading" ? <span className="nd-spark-none" aria-busy="true"><span className="nd-skel" style={{ width: 120, height: 28 }} /></span>
                  : null} />
              <Metric label="Нараховано зарплат" branch={r.tenant_name} onOpen={open("payroll")}
                value={`${formatCurrency(r.payroll_uah)} ₴`}
                sub="за заняття й бонуси" />
            </div>

            <footer className="nd-bcard-foot">
              {share !== null ? (
                <div className="nd-share" title={`${formatNumber(r.students_total)} з ${formatNumber(net.students_total)} — сума баз усіх філій; дитина, записана у двох філіях, рахується двічі`}>
                  <span className="nd-share-bar" aria-hidden="true"><i style={{ width: `${share}%` }} /></span>
                  <span className="nd-share-text">{share} % від бази мережі</span>
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

/** Міні-показник філії: кнопка відкриває той самий показник, але лише для цієї філії.
    Назва філії — прихованим текстом усередині кнопки, щоб скрінрідер чув і контекст, і число. */
function Metric({ label, branch, value, sub, subTitle, extra, onOpen }: {
  label: string; branch: string; value: ReactNode; sub?: ReactNode; subTitle?: string; extra?: ReactNode; onOpen: () => void;
}) {
  return (
    <div className="nd-metric">
      <button type="button" className="nd-metric-main" onClick={onOpen}>
        <span className="nd-metric-label"><span className="sr-only">{branch}: </span>{label}<span className="nd-metric-go" aria-hidden="true"> →</span></span>
        <span className="nd-metric-value">{value}</span>
        {sub && <span className="nd-metric-sub" title={subTitle}>{sub}</span>}
      </button>
      {extra && <div className="nd-metric-extra">{extra}</div>}
    </div>
  );
}

const SPARK_W = 120;
const SPARK_H = 30;
/** Мінімальний розмах шкали у в.п. — щоб коливання на 1–2 в.п. не виглядали як обвал. */
const SPARK_MIN_SPAN = 15;

/** Спарклайн відвідуваності: шкала — за фактичним діапазоном значень (не 0–100 %), межі підписані,
    тож падіння на 10 в.п. видно, а не губиться. Дні (тижні) без занять з дітьми пропущено — це не нуль.
    Точні значення — у графіку мережі й у панелі філії. */
function Sparkline({ series, mode, branch }: { series: { label: string; rate: number | null }[]; mode: "daily" | "weekly"; branch: string }) {
  const points = series.filter((p): p is { label: string; rate: number } => p.rate !== null);
  const n = points.length;
  if (series.length === 0) return null;
  const first = series[0].label;
  const last = series[series.length - 1].label;
  const range = formatRangeShort(first, last);
  if (n === 0) return <span className="nd-spark-none">{range}: занять з дітьми не було</span>;
  const min = Math.min(...points.map((p) => p.rate));
  const max = Math.max(...points.map((p) => p.rate));
  let lo = Math.floor(min);
  let hi = Math.ceil(max);
  if (hi - lo < SPARK_MIN_SPAN) {
    const mid = (lo + hi) / 2;
    lo = Math.max(0, Math.floor(mid - SPARK_MIN_SPAN / 2));
    hi = Math.min(100, lo + SPARK_MIN_SPAN);
    lo = Math.max(0, hi - SPARK_MIN_SPAN);
  }
  const x = (i: number) => (n <= 1 ? SPARK_W / 2 : (i * (SPARK_W - 6)) / (n - 1) + 3);
  const y = (v: number) => 3 + (1 - (v - lo) / (hi - lo)) * (SPARK_H - 6);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join(" ");
  const text = `${mode === "daily" ? "по днях" : "по тижнях"} ${range}: від ${formatPercent(min, 0)} до ${formatPercent(max, 0)}, останнє ${formatPercent(points[n - 1].rate, 0)}; шкала ${lo}–${hi} %, дні без занять пропущено`;
  return (
    <span className="nd-spark-wrap" title={`Відвідуваність ${text}`}>
      <svg className="nd-spark" width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} role="img" aria-label={`Відвідуваність ${branch} ${text}`}>
        <line className="nd-spark-axis" x1={0} x2={SPARK_W} y1={SPARK_H - 3} y2={SPARK_H - 3} />
        <polyline points={line} className="nd-spark-line" />
        <circle cx={x(n - 1)} cy={y(points[n - 1].rate)} r={2.75} className="nd-spark-dot" />
      </svg>
      <span className="nd-spark-scale" aria-hidden="true"><span>{hi} %</span><span>{lo} %</span></span>
    </span>
  );
}
