import { formatNumber, pluralUk } from "../../lib/format";
import { IconCheck } from "../../lib/icons";
import type { AnomalyPage, AttentionReport, MainBranchKpi } from "./api";
import { UNMARKED_LESSON } from "./api";
import { countLessons, type Panel } from "./metrics";

const SHOWN_OTHER = 2;

/** «На зараз»: що треба зробити вже — уся мережа, останні `days` днів, від обраного періоду не залежить.
    Кілька коротких сигналів; кожен відкриває свою вибірку в бічній панелі. */
export function NowStrip({ today, unmarked, attention, days, loading, onOpen }: {
  today: MainBranchKpi | undefined;
  unmarked: AnomalyPage | undefined;
  attention: AttentionReport | undefined;
  days: number;
  loading: boolean;
  onOpen: (panel: Panel) => void;
}) {
  const unmarkedTotal = unmarked?.page.total ?? 0;
  const unmarkedBranches = new Set((unmarked?.rows ?? []).map((r) => r.tenant_id)).size;
  const others = (attention?.items ?? []).filter((it) => it.anomaly_type !== UNMARKED_LESSON);
  const scheduled = today?.lessons_scheduled ?? 0;
  const done = today?.lessons_completed ?? 0;

  return (
    <section className="nd-now" aria-labelledby="nd-now-title">
      <div className="nd-now-head">
        <h3 id="nd-now-title">На зараз</h3>
        <span>уся мережа · останні {formatNumber(days)} {pluralUk(days, "день", "дні", "днів")}</span>
      </div>
      {loading ? (
        <div className="nd-now-items"><span className="nd-skel" style={{ width: 260 }} /><span className="nd-skel" style={{ width: 200 }} /></div>
      ) : (
        <div className="nd-now-items">
          {unmarkedTotal > 0 ? (
            <button type="button" className="nd-signal warn" onClick={() => onOpen({ kind: "unmarked", branch: null, scope: "now" })}>
              <span className="nd-signal-tag">Увага</span>
              <b>{countLessons(unmarkedTotal)} не відмічено</b>
              <span className="nd-signal-sub">· {formatNumber(unmarkedBranches)} {pluralUk(unmarkedBranches, "філія", "філії", "філій")}</span>
              <span className="nd-signal-go" aria-hidden="true">→</span>
            </button>
          ) : (
            <span className="nd-signal ok"><IconCheck /> Усе відмічено</span>
          )}
          {others.slice(0, SHOWN_OTHER).map((it, i) => (
            <button
              key={i}
              type="button"
              className={`nd-signal ${it.severity === "critical" || it.severity === "high" ? "risk" : "warn"}`}
              onClick={() => onOpen({ kind: "attendance", branch: it.tenant_id, scope: "now" })}
            >
              <span className="nd-signal-tag">{it.severity === "critical" || it.severity === "high" ? "Ризик" : "Увага"}</span>
              <b>{it.tenant_name}</b>
              <span className="nd-signal-sub">· {it.summary}</span>
              <span className="nd-signal-go" aria-hidden="true">→</span>
            </button>
          ))}
          <button type="button" className="nd-signal info" onClick={() => onOpen({ kind: "today", branch: null, scope: "now" })}>
            <span className="nd-signal-tag">Сьогодні</span>
            {scheduled > 0 ? <b>{countLessons(scheduled)} за розкладом</b> : <b>уроків немає</b>}
            {scheduled > 0 && <span className="nd-signal-sub">· {formatNumber(done)} проведено</span>}
            <span className="nd-signal-go" aria-hidden="true">→</span>
          </button>
          {others.length > SHOWN_OTHER && (
            <button type="button" className="link nd-now-all" onClick={() => onOpen({ kind: "attention", branch: null, scope: "now" })}>
              Переглянути всі ({formatNumber(others.length + (unmarkedTotal > 0 ? 1 : 0))})
            </button>
          )}
        </div>
      )}
    </section>
  );
}
