import { formatNumber, pluralUk } from "../../lib/format";
import type { AnomalyPage, AttentionReport, MainBranchKpi } from "./api";
import { UNMARKED_LESSON } from "./api";
import { countLessons, type Panel } from "./metrics";

const SHOWN_OTHER = 3;

/** «На зараз» — картка зі списком: що треба зробити вже, уся мережа, останні `days` днів,
    від обраного періоду не залежить. Кожен рядок — кнопка у свою вибірку в бічній панелі. */
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
  const total = others.length + (unmarkedTotal > 0 ? 1 : 0);

  return (
    <section className="nd-card nd-list-card" aria-labelledby="nd-now-title">
      <header className="nd-card-head">
        <h3 id="nd-now-title">На зараз</h3>
        <span className="nd-meta">уся мережа · {formatNumber(days)} {pluralUk(days, "день", "дні", "днів")}</span>
      </header>
      {loading ? (
        <div className="nd-rows" aria-busy="true"><span className="nd-skel" style={{ width: "82%" }} /><span className="nd-skel" style={{ width: "64%" }} /><span className="nd-skel" style={{ width: "70%" }} /></div>
      ) : (
        <div className="nd-rows">
          {unmarkedTotal > 0 ? (
            <button type="button" className="nd-row" onClick={() => onOpen({ kind: "unmarked", branch: null, scope: "now" })}>
              <span className="nd-pill warn">Увага</span>
              <span className="nd-row-text">
                <b>{countLessons(unmarkedTotal)} не відмічено</b>
                <span>{formatNumber(unmarkedBranches)} {pluralUk(unmarkedBranches, "філія", "філії", "філій")} · відмітити у філії</span>
              </span>
              <span className="nd-row-go" aria-hidden="true">→</span>
            </button>
          ) : (
            <div className="nd-row static">
              <span className="nd-pill ok">Усе відмічено</span>
              <span className="nd-row-text"><span>невідмічених уроків немає</span></span>
            </div>
          )}
          {others.slice(0, SHOWN_OTHER).map((it, i) => {
            const risk = it.severity === "critical" || it.severity === "high";
            return (
              <button key={i} type="button" className="nd-row" onClick={() => onOpen({ kind: "attendance", branch: it.tenant_id, scope: "now" })}>
                <span className={`nd-pill ${risk ? "risk" : "warn"}`}>{risk ? "Ризик" : "Увага"}</span>
                <span className="nd-row-text"><b>{it.tenant_name}</b><span>{it.summary}</span></span>
                <span className="nd-row-go" aria-hidden="true">→</span>
              </button>
            );
          })}
          <button type="button" className="nd-row" onClick={() => onOpen({ kind: "today", branch: null, scope: "now" })}>
            <span className="nd-pill info">Сьогодні</span>
            <span className="nd-row-text">
              <b>{scheduled > 0 ? `${countLessons(scheduled)} за розкладом` : "уроків немає"}</b>
              {scheduled > 0 && <span>{formatNumber(done)} проведено · {formatNumber(Math.max(0, scheduled - done))} попереду або без відмітки</span>}
            </span>
            <span className="nd-row-go" aria-hidden="true">→</span>
          </button>
        </div>
      )}
      {!loading && others.length > SHOWN_OTHER && (
        <button type="button" className="nd-card-link" onClick={() => onOpen({ kind: "attention", branch: null, scope: "now" })}>
          Переглянути всі сигнали ({formatNumber(total)}) →
        </button>
      )}
    </section>
  );
}
