import { formatNumber, pluralUk } from "../../lib/format";
import type { AnomalyPage, AttentionReport, MainBranchKpi } from "./api";
import { ANOMALY_LABELS, UNMARKED_LESSON } from "./api";
import { countLessons, type Panel } from "./metrics";

const SHOWN_OTHER = 2;

const lower = (s: string) => s[0].toLowerCase() + s.slice(1);

/** «На зараз» — одна статус-лінія під шапкою, не картка: уся мережа, останні `days` днів,
    від обраного періоду не залежить. Кілька коротких сигналів через «·»; кожен відкриває свою вибірку. */
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
    <section className="nd-now" aria-labelledby="nd-now-title">
      <div className="nd-now-head">
        <h3 id="nd-now-title">На зараз</h3>
        <span>останні {formatNumber(days)} {pluralUk(days, "день", "дні", "днів")}</span>
      </div>
      {loading ? (
        <div className="nd-now-items"><span className="nd-skel" style={{ width: 260 }} /></div>
      ) : (
        <div className="nd-now-items">
          <span className="nd-now-item">
            {unmarkedTotal > 0 ? (
              <button type="button" className="nd-signal warn" onClick={() => onOpen({ kind: "unmarked", branch: null, scope: "now" })}>
                <i className="nd-dot" aria-hidden="true" />
                <b>{countLessons(unmarkedTotal)} не відмічено</b>
                <span className="nd-signal-sub">· {formatNumber(unmarkedBranches)} {pluralUk(unmarkedBranches, "філія", "філії", "філій")}</span>
                <span className="nd-signal-go" aria-hidden="true">→</span>
              </button>
            ) : (
              <span className="nd-signal ok"><i className="nd-dot" aria-hidden="true" />Усе відмічено</span>
            )}
          </span>
          {others.slice(0, SHOWN_OTHER).map((it, i) => {
            const risk = it.severity === "critical" || it.severity === "high";
            return (
              <span className="nd-now-item" key={i}>
                <button
                  type="button"
                  className={`nd-signal ${risk ? "risk" : "warn"}`}
                  title={it.summary}
                  onClick={() => onOpen({ kind: "attendance", branch: it.tenant_id, scope: "now" })}
                >
                  <i className="nd-dot" aria-hidden="true" />
                  <b>{it.tenant_name}:</b>
                  <span className="nd-signal-sub">{lower(ANOMALY_LABELS[it.anomaly_type] ?? it.summary)}</span>
                  <span className="nd-signal-go" aria-hidden="true">→</span>
                </button>
              </span>
            );
          })}
          <span className="nd-now-item">
            <button type="button" className="nd-signal info" onClick={() => onOpen({ kind: "today", branch: null, scope: "now" })}>
              <i className="nd-dot" aria-hidden="true" />
              <b>Сьогодні:</b>
              <span className="nd-signal-sub">{scheduled > 0 ? `${countLessons(scheduled)} за розкладом, ${formatNumber(done)} проведено` : "уроків немає"}</span>
              <span className="nd-signal-go" aria-hidden="true">→</span>
            </button>
          </span>
          {others.length > SHOWN_OTHER && (
            <span className="nd-now-item">
              <button type="button" className="nd-signal more" onClick={() => onOpen({ kind: "attention", branch: null, scope: "now" })}>
                Усі ({formatNumber(total)}) →
              </button>
            </span>
          )}
        </div>
      )}
    </section>
  );
}
