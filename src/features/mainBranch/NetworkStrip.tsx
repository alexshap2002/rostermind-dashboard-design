import type { ReactNode } from "react";
import { formatCurrency, formatNumber, formatPercent } from "../../lib/format";
import type { MainBranchKpi } from "./api";
import { Delta, NewChip, marksText, type Panel, type PanelKind } from "./metrics";

interface Props {
  kpi: MainBranchKpi | undefined;
  title: string;
  /** «Порівнюємо 01–19.10 з 10–28.09» і примітка про методику (на вузьких екранах — лише для скрінрідера й у підказці). */
  compare: { text: string; note: string | null } | null;
  onOpen: (panel: Panel) => void;
}

/** Зведена стрічка мережі: чотири показники в один рядок, кожен — кнопка до розбивки по філіях.
    Компактна, бо головний блок цього варіанту — картки філій нижче. */
export function NetworkStrip({ kpi: k, title, compare, onOpen }: Props) {
  const open = (kind: PanelKind) => () => onOpen({ kind, branch: null, scope: "period" });
  const noCompare = Boolean(k && !k.comparison.previous_period);
  const attDelta = k?.comparison.attendance_rate_pct?.delta_percentage_points;
  const payDelta = k?.comparison.payroll_total_uah?.delta_percent;
  const marks = k ? marksText(k) : null;

  return (
    <section className="nd-strip" aria-labelledby="nd-strip-title">
      <div className="nd-strip-head">
        <h3 id="nd-strip-title">{title}</h3>
        {compare && (
          <span className="nd-compare" title={compare.note ? `${compare.text} (${compare.note})` : "Як рахуємо зміну"}>
            {compare.text}{compare.note && <span className="nd-compare-note"> ({compare.note})</span>}
          </span>
        )}
      </div>
      <div className="nd-strip-cells">
        <Stat label="Діти в базі" loading={!k} onOpen={open("students")}
          value={k ? formatNumber(k.students_total) : ""}
          sub="на кінець періоду"
          extra={k && <NewChip count={k.students_new} onOpen={open("new")} />} />
        <Stat label="Проведено занять" loading={!k} onOpen={open("lessons")}
          value={k ? (k.lessons_scheduled > 0 ? <>{formatNumber(k.lessons_completed)}<small> з {formatNumber(k.lessons_scheduled)}</small></> : "0") : ""}
          sub={k && k.lessons_upcoming > 0 ? `${formatNumber(k.lessons_upcoming)} попереду` : "за розкладом"}
          extra={k && (k.lessons_unmarked_overdue > 0
            ? <button type="button" className="nd-pill warn" onClick={open("unmarked")}>{formatNumber(k.lessons_unmarked_overdue)} не відмічено</button>
            : marks ? <span className="nd-pill">{marks}</span> : null)} />
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

/** Клітинка стрічки: кнопка без aria-label — її ім'я складається з видимого тексту, тож скрінрідер чує і підпис, і число. */
function Stat({ label, value, sub, extra, loading, onOpen }: {
  label: string; value: ReactNode; sub?: ReactNode; extra?: ReactNode; loading: boolean; onOpen: () => void;
}) {
  return (
    <div className="nd-stat">
      <button type="button" className="nd-stat-main" onClick={onOpen}>
        <span className="nd-stat-label">{label}</span>
        {loading ? <span className="nd-skel" style={{ width: 96, height: 28 }} /> : <span className="nd-stat-value">{value}</span>}
        {sub && <span className="nd-stat-sub">{sub}</span>}
        <span className="nd-stat-go">По філіях<span aria-hidden="true"> →</span></span>
      </button>
      {extra && <div className="nd-stat-extra">{extra}</div>}
    </div>
  );
}
