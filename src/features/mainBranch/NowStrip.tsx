import { formatNumber, pluralUk } from "../../lib/format";
import { IconCheck } from "../../lib/icons";
import type { AnomalyPage, AttentionReport, MainBranchKpi } from "./api";
import { UNMARKED_LESSON } from "./api";
import { countLessons, severityTag, type Panel } from "./metrics";

const SHOWN_OTHER = 3;

/** «На зараз» — плитка поруч із hero: що треба зробити вже — уся мережа, останні `days` днів,
    від обраного періоду не залежить. Кожен рядок — кнопка, що відкриває свою вибірку в бічній панелі. */
export function NowStrip({ today, unmarked, attention, days, loading, error, onOpen, onRetry }: {
  today: MainBranchKpi | undefined;
  unmarked: AnomalyPage | undefined;
  attention: AttentionReport | undefined;
  days: number;
  loading: boolean;
  /** Частину запитів не вдалося завантажити — показуємо це, а не «Усе відмічено». */
  error?: boolean;
  onOpen: (panel: Panel) => void;
  onRetry?: () => void;
}) {
  const unmarkedTotal = unmarked?.page.total ?? 0;
  const unmarkedBranches = new Set((unmarked?.rows ?? []).map((r) => r.tenant_id)).size;
  const others = (attention?.items ?? []).filter((it) => it.anomaly_type !== UNMARKED_LESSON);
  const hidden = Math.max(0, others.length - SHOWN_OTHER);
  const scheduled = today?.lessons_scheduled ?? 0;
  // Статуси беремо з полів, а не відніманням: «за розкладом» містить і пропущені заняття.
  const todayParts = today ? [
    `${formatNumber(today.lessons_completed)} проведено`,
    `${formatNumber(today.lessons_upcoming)} попереду`,
    today.lessons_unmarked_overdue > 0 ? `${formatNumber(today.lessons_unmarked_overdue)} не відмічено` : null,
    today.lessons_skipped > 0 ? `${formatNumber(today.lessons_skipped)} пропущено` : null,
  ].filter(Boolean) : [];

  return (
    <section className="tile nd-now" aria-labelledby="nd-now-title">
      <div className="tile-head">
        <h3 id="nd-now-title">На зараз</h3>
        <span className="chip">уся мережа · {formatNumber(days)} {pluralUk(days, "день", "дні", "днів")}</span>
      </div>
      {error ? (
        <div className="nd-now-list">
          <div className="nd-err" role="status">
            Не вдалося завантажити сигнали.{" "}
            {onRetry && <button type="button" className="link" onClick={onRetry}>Спробувати ще</button>}
          </div>
        </div>
      ) : loading ? (
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
            const sev = severityTag(it.severity);
            return (
              <button key={i} type="button" className="nd-now-row" onClick={() => onOpen({ kind: "attendance", branch: it.tenant_id, scope: "now" })}>
                <span className={`nd-tag ${sev.tone}`}>{sev.label}</span>
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
              {scheduled > 0 && <span>{todayParts.join(" · ")}</span>}
            </span>
            <span className="nd-now-go" aria-hidden="true">→</span>
          </button>
        </div>
      )}
      {!loading && !error && (
        <div className="nd-now-foot">
          <button type="button" className="link" onClick={() => onOpen({ kind: "attention", branch: null, scope: "now" })}>
            {hidden > 0
              ? `Ще ${formatNumber(hidden)} ${pluralUk(hidden, "сигнал", "сигнали", "сигналів")} →`
              : `Усі сигнали за ${formatNumber(days)} ${pluralUk(days, "день", "дні", "днів")} →`}
          </button>
        </div>
      )}
    </section>
  );
}
