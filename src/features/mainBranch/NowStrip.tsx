import type { ReactNode } from "react";
import { formatNumber, pluralUk } from "../../lib/format";
import { IconCheck } from "../../lib/icons";
import type { AnomalyPage, AttentionReport, MainBranchKpi } from "./api";
import { UNMARKED_LESSON } from "./api";
import { countLessons, type Panel } from "./metrics";

const SHOWN_OTHER = 2;

/** «Потребує дії зараз»: що треба зробити вже — уся мережа, останні `days` днів, від обраного періоду не залежить.
    Нумерований список коротких рядків; кожен відкриває свою вибірку в бічній панелі. */
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
  const todayText = scheduled > 0
    ? <>{countLessons(scheduled)} за розкладом<span className="nd-act-sub"> · {formatNumber(done)} проведено</span></>
    : <>уроків за розкладом немає</>;
  let n = 0;

  return (
    <section className="nd-act" aria-labelledby="nd-act-title">
      <div className="nd-sec-head">
        <h2 id="nd-act-title">Потребує дії зараз</h2>
        <span>уся мережа · останні {formatNumber(days)} {pluralUk(days, "день", "дні", "днів")}</span>
        {total > SHOWN_OTHER + 1 && (
          <button type="button" className="link nd-sec-link" onClick={() => onOpen({ kind: "attention", branch: null, scope: "now" })}>
            Переглянути всі ({formatNumber(total)})
          </button>
        )}
      </div>
      {loading ? (
        <div className="nd-act-list" aria-busy="true">
          <div className="nd-act-row"><span className="nd-skel" style={{ width: 320 }} /></div>
          <div className="nd-act-row"><span className="nd-skel" style={{ width: 240 }} /></div>
        </div>
      ) : total === 0 ? (
        <div className="nd-act-list">
          <button type="button" className="nd-act-row ok" onClick={() => onOpen({ kind: "today", branch: null, scope: "now" })}>
            <span className="nd-act-ic" aria-hidden="true"><IconCheck /></span>
            <span className="nd-act-text"><b>Усе відмічено</b> · сьогодні {todayText}</span>
            <span className="nd-act-go" aria-hidden="true">→</span>
          </button>
        </div>
      ) : (
        <ol className="nd-act-list">
          {unmarkedTotal > 0 && (
            <li>
              <Row n={++n} tag="Увага" tone="warn" onClick={() => onOpen({ kind: "unmarked", branch: null, scope: "now" })}>
                <b>{countLessons(unmarkedTotal)} не відмічено</b>
                <span className="nd-act-sub"> · {formatNumber(unmarkedBranches)} {pluralUk(unmarkedBranches, "філія", "філії", "філій")}</span>
              </Row>
            </li>
          )}
          {others.slice(0, SHOWN_OTHER).map((it, i) => {
            const risk = it.severity === "critical" || it.severity === "high";
            return (
              <li key={i}>
                <Row n={++n} tag={risk ? "Ризик" : "Увага"} tone={risk ? "risk" : "warn"} onClick={() => onOpen({ kind: "attendance", branch: it.tenant_id, scope: "now" })}>
                  <b>{it.tenant_name}</b><span className="nd-act-sub"> · {it.summary}</span>
                </Row>
              </li>
            );
          })}
          <li>
            <Row n={++n} tag="Сьогодні" tone="info" onClick={() => onOpen({ kind: "today", branch: null, scope: "now" })}>
              {todayText}
            </Row>
          </li>
        </ol>
      )}
    </section>
  );
}

function Row({ n, tag, tone, onClick, children }: {
  n: number; tag: string; tone: "warn" | "risk" | "info"; onClick: () => void; children: ReactNode;
}) {
  return (
    <button type="button" className={`nd-act-row ${tone}`} onClick={onClick}>
      <span className="nd-act-n" aria-hidden="true">{n}</span>
      <span className={`nd-tag ${tone}`}>{tag}</span>
      <span className="nd-act-text">{children}</span>
      <span className="nd-act-go" aria-hidden="true">→</span>
    </button>
  );
}
