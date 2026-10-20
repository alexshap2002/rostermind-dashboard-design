import { formatNumber, pluralUk } from "../../lib/format";
import { IconCheck } from "../../lib/icons";
import { ANOMALY_LABELS, UNMARKED_LESSON, type AnomalyPage, type AttentionReport, type MainBranchKpi } from "./api";
import { countLessons, type Panel } from "./metrics";

const SHOWN_PERIOD = 6;

interface Props {
  today: MainBranchKpi | undefined;
  unmarked: AnomalyPage | undefined;
  attention: AttentionReport | undefined;
  periodAttention: AttentionReport | undefined;
  days: number;
  periodLabel: string;
  loading: boolean;
  onOpen: (panel: Panel) => void;
}

interface Card { tone: "warn" | "risk" | "info"; tag: string; title: string; sub: string; panel: Panel }

/** Права колонка «Події» (як стрічка Activity на референсі): спершу «На зараз» — уся мережа за останні
    `days` днів, незалежно від обраного періоду; нижче — сигнали за обраний період. Кожна картка — кнопка
    у свою вибірку в бічній панелі. */
export function EventsFeed({ today, unmarked, attention, periodAttention, days, periodLabel, loading, onOpen }: Props) {
  const unmarkedTotal = unmarked?.page.total ?? 0;
  const unmarkedBranches = new Set((unmarked?.rows ?? []).map((r) => r.tenant_id)).size;
  const others = (attention?.items ?? []).filter((it) => it.anomaly_type !== UNMARKED_LESSON);
  const scheduled = today?.lessons_scheduled ?? 0;
  const done = today?.lessons_completed ?? 0;

  const now: Card[] = [];
  if (unmarkedTotal > 0) {
    now.push({
      tone: "warn", tag: "Увага", title: `${countLessons(unmarkedTotal)} не відмічено`,
      sub: `${formatNumber(unmarkedBranches)} ${pluralUk(unmarkedBranches, "філія", "філії", "філій")} · відмітити у філії`,
      panel: { kind: "unmarked", branch: null, scope: "now" },
    });
  }
  for (const it of others) {
    now.push({
      tone: it.severity === "critical" || it.severity === "high" ? "risk" : "warn",
      tag: it.severity === "critical" || it.severity === "high" ? "Ризик" : "Увага",
      title: it.tenant_name, sub: it.summary,
      panel: { kind: "attendance", branch: it.tenant_id, scope: "now" },
    });
  }
  now.push({
    tone: "info", tag: "Сьогодні",
    title: scheduled > 0 ? `${countLessons(scheduled)} за розкладом` : "Уроків немає",
    sub: scheduled > 0 ? `${formatNumber(done)} проведено` : "за розкладом на сьогодні нічого",
    panel: { kind: "today", branch: null, scope: "now" },
  });

  // За період: невідмічені згорнуто по філіях, решта сигналів — окремими картками.
  const period: Card[] = [];
  const unmarkedByTenant = new Map<number, { name: string; n: number }>();
  for (const it of periodAttention?.items ?? []) {
    if (it.anomaly_type === UNMARKED_LESSON) {
      const cur = unmarkedByTenant.get(it.tenant_id) ?? { name: it.tenant_name, n: 0 };
      unmarkedByTenant.set(it.tenant_id, { name: cur.name, n: cur.n + 1 });
    } else {
      period.push({
        tone: it.severity === "critical" || it.severity === "high" ? "risk" : "warn",
        tag: ANOMALY_LABELS[it.anomaly_type] ?? it.anomaly_type,
        title: it.tenant_name, sub: it.summary,
        panel: { kind: it.anomaly_type === "ATTENDANCE_DROP" ? "attendance" : "attention", branch: it.tenant_id, scope: "period" },
      });
    }
  }
  for (const [id, x] of unmarkedByTenant) {
    period.push({ tone: "warn", tag: "Не відмічено", title: x.name, sub: `${countLessons(x.n)} без відмітки за період`, panel: { kind: "unmarked", branch: id, scope: "period" } });
  }
  const periodTotal = periodAttention?.totals.total ?? 0;

  return (
    <aside className="nd-feed" aria-labelledby="nd-feed-title">
      <h3 id="nd-feed-title" className="nd-feed-title">Події</h3>

      <section className="nd-feed-group" aria-labelledby="nd-feed-now">
        <h4 id="nd-feed-now" className="nd-feed-sub">На зараз <span>уся мережа · {formatNumber(days)} {pluralUk(days, "день", "дні", "днів")}</span></h4>
        {loading ? (
          <div className="nd-feed-list"><span className="nd-skel" style={{ height: 64 }} /><span className="nd-skel" style={{ height: 64 }} /></div>
        ) : (
          <div className="nd-feed-list">
            {unmarkedTotal === 0 && others.length === 0 && (
              <div className="nd-ev ok"><IconCheck /><b>Усе відмічено</b><span className="nd-ev-sub">сигналів немає</span></div>
            )}
            {now.map((c, i) => <EventCard key={i} card={c} onOpen={onOpen} />)}
          </div>
        )}
      </section>

      <section className="nd-feed-group" aria-labelledby="nd-feed-period">
        <h4 id="nd-feed-period" className="nd-feed-sub">За період <span>{periodLabel}</span></h4>
        {!periodAttention ? (
          <div className="nd-feed-list"><span className="nd-skel" style={{ height: 64 }} /></div>
        ) : period.length === 0 ? (
          <div className="nd-ev ok"><IconCheck /><b>Усе спокійно</b><span className="nd-ev-sub">за період сигналів немає</span></div>
        ) : (
          <div className="nd-feed-list">
            {period.slice(0, SHOWN_PERIOD).map((c, i) => <EventCard key={i} card={c} onOpen={onOpen} />)}
            {(period.length > SHOWN_PERIOD || periodTotal > period.length) && (
              <button type="button" className="nd-feed-all" onClick={() => onOpen({ kind: "attention", branch: null, scope: "period" })}>
                Усі сигнали за період ({formatNumber(periodTotal)}) →
              </button>
            )}
          </div>
        )}
      </section>
    </aside>
  );
}

function EventCard({ card, onOpen }: { card: Card; onOpen: (panel: Panel) => void }) {
  return (
    <button type="button" className={`nd-ev ${card.tone}`} onClick={() => onOpen(card.panel)}>
      <span className="nd-ev-tag">{card.tag}</span>
      <b>{card.title}</b>
      <span className="nd-ev-sub">{card.sub}</span>
      <span className="nd-ev-go" aria-hidden="true">→</span>
    </button>
  );
}
