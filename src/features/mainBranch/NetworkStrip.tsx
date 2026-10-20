import type { ReactNode } from "react";
import { formatCurrency, formatNumber, formatPercent } from "../../lib/format";
import type { MainBranchFilters, MainBranchKpi } from "./api";
import { Delta, type Panel, type PanelKind } from "./metrics";

interface Props {
  kpi: MainBranchKpi | undefined;
  filters: MainBranchFilters;
  title: string;
  compareText: string | null;
  onOpen: (panel: Panel) => void;
}

/** Зведена стрічка мережі: чотири показники в один рядок, кожен — кнопка до розбивки по філіях.
    Компактна, бо головний блок цього варіанту — картки філій нижче. */
export function NetworkStrip({ kpi: k, title, compareText, onOpen }: Props) {
  const open = (kind: PanelKind) => () => onOpen({ kind, branch: null, scope: "period" });
  const noCompare = Boolean(k && !k.comparison.previous_period);
  const attDelta = k?.comparison.attendance_rate_pct?.delta_percentage_points;
  const payDelta = k?.comparison.payroll_total_uah?.delta_percent;

  return (
    <section className="nd-strip" aria-labelledby="nd-strip-title">
      <div className="nd-strip-head">
        <h3 id="nd-strip-title">{title}</h3>
        {compareText && <span className="nd-compare" title="Як рахуємо зміну">{compareText}</span>}
      </div>
      <div className="nd-strip-cells">
        <Stat label="Діти в базі" loading={!k} onOpen={open("students")}
          value={k ? formatNumber(k.students_total) : ""}
          sub="на кінець періоду"
          extra={k && (
            <button type="button" className={`nd-chip-new${k.students_new > 0 ? "" : " zero"}`} onClick={open("new")}>
              {k.students_new > 0 ? `+${formatNumber(k.students_new)} нових` : "нових немає"}
            </button>
          )} />
        <Stat label="Проведено занять" loading={!k} onOpen={open("lessons")}
          value={k ? <>{formatNumber(k.lessons_completed)}<small> з {formatNumber(k.lessons_scheduled)}</small></> : ""}
          sub={k && k.lessons_upcoming > 0 ? `${formatNumber(k.lessons_upcoming)} попереду` : "за розкладом"}
          extra={k && (k.lessons_unmarked_overdue > 0
            ? <button type="button" className="nd-pill warn" onClick={() => onOpen({ kind: "unmarked", branch: null, scope: "period" })}>{formatNumber(k.lessons_unmarked_overdue)} не відмічено</button>
            : <span className="nd-pill ok">усі відмічено</span>)} />
        <Stat label="Відвідуваність" loading={!k} onOpen={open("attendance")}
          value={k ? (k.attendance_has_data ? formatPercent(k.attendance_rate_pct) : "—") : ""}
          sub={k ? (!k.attendance_has_data ? "занять з дітьми не було" : noCompare ? "порівняємо завтра"
            : attDelta === null || attDelta === undefined ? "немає з чим порівняти" : <><Delta value={attDelta} unit="pp" /> до попереднього</>) : null} />
        <Stat label="Нараховано зарплат" loading={!k} onOpen={open("payroll")}
          value={k ? `${formatCurrency(k.payroll_total_uah)} ₴` : ""}
          sub={k ? (noCompare ? "порівняємо завтра"
            : payDelta === null || payDelta === undefined ? "немає з чим порівняти" : <><Delta value={payDelta} unit="pct" tone="neutral" /> до попереднього</>) : null} />
      </div>
    </section>
  );
}

function Stat({ label, value, sub, extra, loading, onOpen }: {
  label: string; value: ReactNode; sub?: ReactNode; extra?: ReactNode; loading: boolean; onOpen: () => void;
}) {
  return (
    <div className="nd-stat">
      <button type="button" className="nd-stat-main" onClick={onOpen} aria-label={`${label}: переглянути по філіях`}>
        <span className="nd-stat-label">{label}</span>
        {loading ? <span className="nd-skel" style={{ width: 96, height: 28 }} /> : <span className="nd-stat-value">{value}</span>}
        {sub && <span className="nd-stat-sub">{sub}</span>}
        <span className="nd-stat-go" aria-hidden="true">По філіях →</span>
      </button>
      {extra && <div className="nd-stat-extra">{extra}</div>}
    </div>
  );
}
