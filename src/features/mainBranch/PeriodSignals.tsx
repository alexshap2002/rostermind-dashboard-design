import { formatNumber } from "../../lib/format";
import { IconCheck } from "../../lib/icons";
import { ANOMALY_LABELS, SEVERITY, UNMARKED_LESSON, type AttentionReport } from "./api";
import { countLessons, isRisk, lowerFirst, panelForAnomaly, severityRank, type Panel } from "./metrics";

const SHOWN = 5;

interface Row { key: string; risk: boolean; rank: number; n: number; label: string; title: string; sub: string; panel: Panel }

/** Сигнали за обраний період (не «На зараз» — вікно винесено в заголовок): невідмічені уроки згорнуто
    по філіях, решта — окремими рядками; спершу за рівнем, далі за кількістю. Клік відкриває саме цю
    вибірку в бічній панелі. «Усе спокійно» — лише коли звіт справді завантажено і він порожній:
    помилка — окремий стан із повторною спробою, а не фальшивий нуль. */
export function PeriodSignals({ report, loading, error, periodLabel, onRetry, onOpen }: {
  report: AttentionReport | undefined;
  loading: boolean;
  error: boolean;
  periodLabel: string;
  onRetry: () => void;
  onOpen: (panel: Panel) => void;
}) {
  const items = report?.items ?? [];
  const unmarkedBy = new Map<number, { name: string; n: number }>();
  for (const it of items) {
    if (it.anomaly_type !== UNMARKED_LESSON) continue;
    const cur = unmarkedBy.get(it.tenant_id) ?? { name: it.tenant_name, n: 0 };
    unmarkedBy.set(it.tenant_id, { name: cur.name, n: cur.n + 1 });
  }
  const rows: Row[] = [
    ...items.filter((it) => it.anomaly_type !== UNMARKED_LESSON).map((it, i): Row => ({
      key: `${it.anomaly_type}-${it.tenant_id}-${i}`,
      risk: isRisk(it.severity),
      rank: severityRank(it.severity),
      n: 1,
      label: (SEVERITY[it.severity] ?? SEVERITY.info).label,
      // Заголовок — summary сервера (з числами); тип не повторюємо в підрядку, якщо summary є.
      title: it.summary || ANOMALY_LABELS[it.anomaly_type] || it.anomaly_type,
      sub: [it.tenant_name, it.club_name].filter(Boolean).join(" · "),
      panel: panelForAnomaly(it.anomaly_type, it.tenant_id, "period"),
    })),
    ...[...unmarkedBy].map(([tenantId, x]): Row => ({
      key: `unmarked-${tenantId}`,
      risk: false,
      rank: severityRank("warning"),
      n: x.n,
      label: SEVERITY.warning.label,
      title: `${countLessons(x.n)} не відмічено`,
      sub: x.name,
      panel: panelForAnomaly(UNMARKED_LESSON, tenantId, "period"),
    })),
  ];
  rows.sort((a, b) => a.rank - b.rank || b.n - a.n);
  const total = rows.length;

  return (
    <section className="nd-card" aria-labelledby="nd-signals-title">
      <div className="nd-card-head">
        <div>
          <h3 id="nd-signals-title">Сигнали за {lowerFirst(periodLabel)}</h3>
          <p>за обраний період, не «На зараз» — де потрібне втручання, по філіях</p>
        </div>
      </div>
      <div className="nd-siglist">
        {loading && <span className="nd-skel" style={{ width: "100%", height: 120 }} />}
        {!loading && error && (
          <span className="nd-empty nd-siglist-error" role="status">
            Сигнали не завантажились.{" "}
            <button type="button" className="link nd-more" onClick={onRetry}>Спробувати ще</button>
          </span>
        )}
        {!loading && !error && report && total === 0 && (
          <span className="nd-empty nd-siglist-ok"><IconCheck width={16} height={16} aria-hidden="true" /> Сигналів немає — усе спокійно</span>
        )}
        {!loading && !error && rows.slice(0, SHOWN).map((r) => (
          <button key={r.key} type="button" className="nd-sigrow" onClick={() => onOpen(r.panel)}>
            <span className={`nd-sev${r.risk ? " risk" : ""}`}>{r.label}</span>
            <span>
              <span className="nd-sig-title">{r.title}</span>
              {r.sub && <span className="nd-sig-sub">{r.sub}</span>}
            </span>
            <span className="nd-signal-go" aria-hidden="true">→</span>
          </button>
        ))}
        {!loading && !error && total > SHOWN && (
          <div className="nd-siglist-foot">
            <button type="button" className="link nd-more" onClick={() => onOpen({ kind: "attention", branch: null, scope: "period" })}>
              Усі сигнали ({formatNumber(report?.totals.total ?? total)}) →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
