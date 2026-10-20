import type { ReactNode } from "react";
import { formatCurrency, formatNumber, formatPercent } from "../../lib/format";
import { IconArrowUpRight } from "../../lib/icons";
import type { MainBranchKpi } from "./api";
import { Delta, type Panel, type PanelKind } from "./metrics";

interface Props {
  k: MainBranchKpi | undefined;
  noCompare: boolean;
  onOpen: (panel: Panel) => void;
}

/** Чотири кольорові плитки (як на референсі): темний текст на пастелі, велике число, під ним смужка
    прогресу там, де є «з чого» (заняття — з запланованих, відвідуваність — зі 100 %). Уся плитка — кнопка
    у розбивку по філіях; чипи «+N нових», «не відмічено», «попереду» — окремі кнопки. */
export function KpiTiles({ k, noCompare, onOpen }: Props) {
  const open = (kind: PanelKind) => () => onOpen({ kind, branch: null, scope: "period" });
  const attDelta = k?.comparison.attendance_rate_pct?.delta_percentage_points;
  const payDelta = k?.comparison.payroll_total_uah?.delta_percent;
  const compareSub = (delta: number | null | undefined, unit: "pp" | "pct", tone: "good" | "neutral") =>
    noCompare ? "порівняємо завтра — день ще триває"
      : delta === null || delta === undefined ? "немає з чим порівняти"
      : <><Delta value={delta} unit={unit} tone={tone} /> до попереднього періоду</>;

  return (
    <div className="nd-tiles">
      <Tile tone="yellow" label="Діти в базі" loading={!k} onOpen={open("students")}
        value={k ? formatNumber(k.students_total) : ""}
        sub="поточна база на кінець періоду"
        extra={k && (
          <button type="button" className="nd-tile-chip" onClick={open("new")}>
            {k.students_new > 0 ? `+${formatNumber(k.students_new)} нових за період` : "нових за період немає"}
          </button>
        )} />

      <Tile tone="orange" label="Проведено занять" loading={!k} onOpen={open("lessons")}
        value={k ? <>{formatNumber(k.lessons_completed)}<small> з {formatNumber(k.lessons_scheduled)}</small></> : ""}
        sub="навчальні заняття з відміткою · із запланованих"
        bar={k && k.lessons_scheduled > 0 ? k.lessons_completed / k.lessons_scheduled : null}
        extra={k && (
          <>
            {k.lessons_unmarked_overdue > 0
              ? <button type="button" className="nd-tile-chip warn" onClick={() => onOpen({ kind: "unmarked", branch: null, scope: "period" })}>{formatNumber(k.lessons_unmarked_overdue)} не відмічено</button>
              : <span className="nd-tile-chip">усі відмічено</span>}
            {k.lessons_upcoming > 0 && <span className="nd-tile-chip">{formatNumber(k.lessons_upcoming)} попереду</span>}
          </>
        )} />

      <Tile tone="green" label="Відвідуваність" loading={!k} onOpen={open("attendance")}
        value={k ? (k.attendance_has_data ? formatPercent(k.attendance_rate_pct) : "—") : ""}
        sub={k ? (!k.attendance_has_data ? "занять з дітьми не було" : compareSub(attDelta, "pp", "good")) : null}
        bar={k && k.attendance_has_data ? k.attendance_rate_pct / 100 : null} />

      <Tile tone="blue" label="Нараховано зарплат" loading={!k} onOpen={open("payroll")}
        value={k ? `${formatCurrency(k.payroll_total_uah)} ₴` : ""}
        sub={k ? compareSub(payDelta, "pct", "neutral") : null} />
    </div>
  );
}

function Tile({ tone, label, value, sub, bar, extra, loading, onOpen }: {
  tone: "yellow" | "orange" | "green" | "blue"; label: string; value: ReactNode; sub?: ReactNode;
  bar?: number | null; extra?: ReactNode; loading: boolean; onOpen: () => void;
}) {
  return (
    <div className={`nd-tile ${tone}`}>
      <button type="button" className="nd-tile-main" onClick={onOpen} aria-label={`${label}: переглянути по філіях`}>
        <span className="nd-tile-head">
          <span className="nd-tile-label">{label}</span>
          <span className="nd-tile-go" aria-hidden="true"><IconArrowUpRight /></span>
        </span>
        {loading ? <span className="nd-skel dark" style={{ width: 140, height: 38 }} /> : <span className="nd-tile-value">{value}</span>}
        {sub && <span className="nd-tile-sub">{sub}</span>}
        {bar !== null && bar !== undefined && (
          <span className="nd-tile-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, bar * 100))}%` }} /></span>
        )}
        <span className="nd-tile-cta">Переглянути по філіях</span>
      </button>
      {extra && <div className="nd-tile-extra">{extra}</div>}
    </div>
  );
}
