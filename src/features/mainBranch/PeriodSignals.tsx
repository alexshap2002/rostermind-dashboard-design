import { formatNumber } from "../../lib/format";
import { IconCheck } from "../../lib/icons";
import { ANOMALY_LABELS, SEVERITY, UNMARKED_LESSON, type AttentionReport } from "./api";
import { countLessons, type Panel } from "./metrics";

const SHOWN = 5;

interface Row { key: string; risk: boolean; label: string; title: string; sub: string; panel: Panel }

/** Сигнали за обраний період (не «На зараз»): невідмічені уроки згорнуто по філіях, решта — окремими рядками.
    Клік відкриває саме цю вибірку в бічній панелі. */
export function PeriodSignals({ report, loading, onOpen }: {
  report: AttentionReport | undefined;
  loading: boolean;
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
    ...items.filter((it) => it.anomaly_type !== UNMARKED_LESSON).map((it, i): Row => {
      const sev = SEVERITY[it.severity] ?? SEVERITY.info;
      return {
        key: `${it.anomaly_type}-${it.tenant_id}-${i}`,
        risk: sev.tone === "delete",
        label: sev.label,
        title: it.summary,
        sub: [it.tenant_name, it.club_name, ANOMALY_LABELS[it.anomaly_type]].filter(Boolean).join(" · "),
        panel: { kind: it.anomaly_type === "ATTENDANCE_DROP" ? "attendance" : "attention", branch: it.tenant_id, scope: "period" },
      };
    }),
    ...[...unmarkedBy].map(([tenantId, x]): Row => ({
      key: `unmarked-${tenantId}`,
      risk: false,
      label: SEVERITY.warning.label,
      title: `${countLessons(x.n)} не відмічено`,
      sub: x.name,
      panel: { kind: "unmarked", branch: tenantId, scope: "period" },
    })),
  ];
  rows.sort((a, b) => Number(b.risk) - Number(a.risk));
  const total = rows.length;

  return (
    <section className="nd-card" aria-labelledby="nd-signals-title">
      <div className="nd-card-head">
        <div>
          <h3 id="nd-signals-title">Сигнали за період</h3>
          <p>де потрібне втручання — по філіях</p>
        </div>
      </div>
      <div className="nd-siglist">
        {loading && <span className="nd-skel" style={{ width: "100%", height: 120 }} />}
        {!loading && total === 0 && <span className="nd-empty"><IconCheck width={16} height={16} /> Сигналів немає — усе спокійно</span>}
        {!loading && rows.slice(0, SHOWN).map((r) => (
          <button key={r.key} type="button" className="nd-sigrow" onClick={() => onOpen(r.panel)}>
            <span className={`nd-sev${r.risk ? " risk" : ""}`}>{r.label}</span>
            <span>
              <span className="nd-sig-title">{r.title}</span>
              <span className="nd-sig-sub">{r.sub}</span>
            </span>
            <span className="nd-signal-go" aria-hidden="true">→</span>
          </button>
        ))}
        {!loading && total > SHOWN && (
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
