import { formatNumber, pluralUk } from "../../lib/format";
import { IconCheck } from "../../lib/icons";
import type { AnomalyPage, AttentionReport, MainBranchKpi } from "./api";
import { UNMARKED_LESSON } from "./api";
import { countLessons, type Panel } from "./metrics";

const SHOWN_OTHER = 3;

/** «На зараз» — плитка поруч із hero: що треба зробити вже — уся мережа, останні `days` днів,
    від обраного періоду не залежить. Кожен рядок — кнопка, що відкриває свою вибірку в бічній панелі. */
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
    <section className="tile nd-now" aria-labelledby="nd-now-title">
      <div className="tile-head">
        <h3 id="nd-now-title">На зараз</h3>
        <span className="chip">уся мережа · {formatNumber(days)} {pluralUk(days, "день", "дні", "днів")}</span>
      </div>
      {loading ? (
        <div className="nd-now-list">
          <span className="nd-skel" style={{ width: "90%" }} />
          <span className="nd-skel" style={{ width: "70%" }} />
          <span className="nd-skel" style={{ width: "80%" }} />
        </div>
      ) : (
        <div className="nd-now-list">
          {unmarkedTotal > 0 ? (
            <button type="button" className="nd-now-row" onClick={() => onOpen({ kind: "unmarked", branch: null, scope: "now" })}>
              <span className="nd-tag warn">Увага</span>
              <span className="nd-now-text">
                <b>{countLessons(unmarkedTotal)} не відмічено</b>
                <span>{formatNumber(unmarkedBranches)} {pluralUk(unmarkedBranches, "філія", "філії", "філій")} · відмітити у філії</span>
              </span>
              <span className="nd-now-go" aria-hidden="true">→</span>
            </button>
          ) : (
            <div className="nd-now-row calm">
              <span className="nd-tag ok"><IconCheck /></span>
              <span className="nd-now-text"><b>Усе відмічено</b><span>невідмічених занять немає</span></span>
            </div>
          )}
          {others.slice(0, SHOWN_OTHER).map((it, i) => {
            const risk = it.severity === "critical" || it.severity === "high";
            return (
              <button key={i} type="button" className="nd-now-row" onClick={() => onOpen({ kind: "attendance", branch: it.tenant_id, scope: "now" })}>
                <span className={`nd-tag ${risk ? "risk" : "warn"}`}>{risk ? "Ризик" : "Увага"}</span>
                <span className="nd-now-text">
                  <b>{it.tenant_name}</b>
                  <span>{it.summary}</span>
                </span>
                <span className="nd-now-go" aria-hidden="true">→</span>
              </button>
            );
          })}
          <button type="button" className="nd-now-row" onClick={() => onOpen({ kind: "today", branch: null, scope: "now" })}>
            <span className="nd-tag info">Сьогодні</span>
            <span className="nd-now-text">
              <b>{scheduled > 0 ? `${countLessons(scheduled)} за розкладом` : "Уроків за розкладом немає"}</b>
              {scheduled > 0 && <span>{formatNumber(done)} проведено · {formatNumber(Math.max(0, scheduled - done))} попереду або без відмітки</span>}
            </span>
            <span className="nd-now-go" aria-hidden="true">→</span>
          </button>
        </div>
      )}
      {!loading && (
        <div className="nd-now-foot">
          <button type="button" className="link" onClick={() => onOpen({ kind: "attention", branch: null, scope: "now" })}>
            {total > 0 ? `Переглянути всі сигнали (${formatNumber(total)})` : "Усі сигнали"}
          </button>
        </div>
      )}
    </section>
  );
}
