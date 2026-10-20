import { formatNumber, formatUpdatedAt, pluralUk } from "../../lib/format";
import { IconCheck, IconDownload } from "../../lib/icons";
import type { AnomalyPage, AttentionReport, BranchRow, MainBranchKpi, NetworkContext } from "./api";
import { UNMARKED_LESSON } from "./api";
import { countLessons, type Panel } from "./metrics";

const SHOWN_OTHER = 2;

export interface PeriodOption { key: string; label: string; range: string; on: boolean; onPick: () => void }

interface Props {
  periods: PeriodOption[];
  custom: { on: boolean; dateFrom: string; dateTo: string; onPick: () => void; onRange: (r: { dateFrom: string; dateTo: string }) => void };
  branches: NetworkContext["branches"];
  selected: number[];
  /** Рядки по всіх філіях за період (без фільтра) — щоб кількість дітей не зникала, коли філію знято з вибору. */
  rowsAll: BranchRow[] | undefined;
  /** Невідмічені уроки за «На зараз» (30 днів) по філіях. */
  unmarkedByTenant: Record<string, number>;
  onToggleBranch: (id: number) => void;
  onAllBranches: () => void;
  now: {
    today: MainBranchKpi | undefined;
    unmarked: AnomalyPage | undefined;
    attention: AttentionReport | undefined;
    days: number;
    loading: boolean;
    onOpen: (panel: Panel) => void;
  };
  updatedAt: string | undefined;
  onRefresh: () => void;
  canExport: boolean;
  downloading: boolean;
  onExport: () => void;
}

/** Бічна панель консолі: період, філії, сигнали «На зараз», оновлення й експорт.
    На вузькому екрані ті самі блоки стають рядками чипів над робочою зоною (лише CSS). */
export function ConsoleSidebar({
  periods, custom, branches, selected, rowsAll, unmarkedByTenant, onToggleBranch, onAllBranches, now, updatedAt, onRefresh, canExport, downloading, onExport,
}: Props) {
  const byTenant = new Map((rowsAll ?? []).map((r) => [r.tenant_id, r]));
  const allStudents = (rowsAll ?? []).reduce((s, r) => s + r.students_total, 0);

  return (
    <aside className="nd-side" aria-label="Сигнали, період і філії">
      <section className="nd-side-block" aria-labelledby="nd-side-now">
        <h3 className="nd-side-title" id="nd-side-now">На зараз <span>{formatNumber(now.days)} {pluralUk(now.days, "день", "дні", "днів")}</span></h3>
        <NowList {...now} />
      </section>

      <section className="nd-side-block" aria-labelledby="nd-side-period">
        <h3 className="nd-side-title" id="nd-side-period">Період</h3>
        <div className="nd-radios" role="radiogroup" aria-label="Період">
          {periods.map((p) => (
            <button key={p.key} type="button" role="radio" aria-checked={p.on} className={`nd-radio${p.on ? " on" : ""}`} onClick={p.onPick}>
              <span>{p.label}</span>
              <span className="nd-radio-sub">{p.range}</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={custom.on} className={`nd-radio${custom.on ? " on" : ""}`} onClick={custom.onPick}>
            <span>Свій період</span>
          </button>
        </div>
        {custom.on && (
          <div className="nd-dates">
            <label><span>Від</span><input type="date" value={custom.dateFrom} max={custom.dateTo} onChange={(e) => e.target.value && custom.onRange({ dateFrom: e.target.value, dateTo: custom.dateTo })} /></label>
            <label><span>До</span><input type="date" value={custom.dateTo} min={custom.dateFrom} onChange={(e) => e.target.value && custom.onRange({ dateFrom: custom.dateFrom, dateTo: e.target.value })} /></label>
          </div>
        )}
      </section>

      {branches.length > 1 && (
        <section className="nd-side-block" aria-labelledby="nd-side-branches">
          <h3 className="nd-side-title" id="nd-side-branches">Філії <span>{formatNumber(branches.length)}</span></h3>
          <div className="nd-checks">
            <label className="nd-check">
              <input type="checkbox" checked={selected.length === 0} onChange={onAllBranches} />
              <span className="nd-check-name">Усі філії</span>
              {rowsAll && <span className="nd-check-meta" title="Діти в базі">{formatNumber(allStudents)}</span>}
            </label>
            {branches.map((b) => {
              const row = byTenant.get(b.tenant_id);
              const unmarked = unmarkedByTenant[String(b.tenant_id)] ?? 0;
              return (
                <label key={b.tenant_id} className="nd-check">
                  <input type="checkbox" checked={selected.includes(b.tenant_id)} onChange={() => onToggleBranch(b.tenant_id)} />
                  <span className="nd-check-name">{b.tenant_name}</span>
                  {unmarked > 0 && <span className="nd-badge warn" title="Не відмічено за останні 30 днів">{formatNumber(unmarked)} не відмічено</span>}
                  {row && <span className="nd-check-meta" title="Діти в базі">{formatNumber(row.students_total)}</span>}
                </label>
              );
            })}
          </div>
        </section>
      )}


      <div className="nd-side-foot">
        <button type="button" className="btn ghost sm" onClick={onRefresh}>Оновити</button>
        {canExport && (
          <button type="button" className="btn ghost sm keep-label" disabled={downloading} onClick={onExport}>
            <IconDownload /><span>{downloading ? "Готуємо…" : "Excel"}</span>
          </button>
        )}
        <span className="nd-updated">{updatedAt ? `Оновлено ${formatUpdatedAt(updatedAt)}` : "Завантаження…"}</span>
      </div>
    </aside>
  );
}

/** Сигнали на зараз: уся мережа, останні N днів — не залежать від обраного періоду.
    Кожен відкриває свою вибірку в бічній панелі показника. */
function NowList({ today, unmarked, attention, loading, onOpen }: Props["now"]) {
  const unmarkedTotal = unmarked?.page.total ?? 0;
  const unmarkedBranches = new Set((unmarked?.rows ?? []).map((r) => r.tenant_id)).size;
  const others = (attention?.items ?? []).filter((it) => it.anomaly_type !== UNMARKED_LESSON);
  const scheduled = today?.lessons_scheduled ?? 0;
  const done = today?.lessons_completed ?? 0;

  if (loading) {
    return <div className="nd-sigs"><span className="nd-skel" style={{ width: "90%" }} /><span className="nd-skel" style={{ width: "70%" }} /></div>;
  }
  return (
    <div className="nd-sigs">
      {unmarkedTotal > 0 ? (
        <button type="button" className="nd-sig warn" onClick={() => onOpen({ kind: "unmarked", branch: null, scope: "now" })}>
          <span className="nd-sig-dot" aria-hidden="true" />
          <span className="nd-sig-body">
            <b>{countLessons(unmarkedTotal)} не відмічено</b>
            <span>Увага · {formatNumber(unmarkedBranches)} {pluralUk(unmarkedBranches, "філія", "філії", "філій")}</span>
          </span>
          <span className="nd-sig-go" aria-hidden="true">→</span>
        </button>
      ) : (
        <div className="nd-sig ok">
          <IconCheck className="nd-sig-ic" aria-hidden="true" />
          <span className="nd-sig-body"><b>Усе відмічено</b></span>
        </div>
      )}
      {others.slice(0, SHOWN_OTHER).map((it, i) => {
        const risk = it.severity === "critical" || it.severity === "high";
        return (
          <button key={i} type="button" className={`nd-sig ${risk ? "risk" : "warn"}`} onClick={() => onOpen({ kind: "attendance", branch: it.tenant_id, scope: "now" })}>
            <span className="nd-sig-dot" aria-hidden="true" />
            <span className="nd-sig-body">
              <b>{it.tenant_name}</b>
              <span className="nd-sig-clamp" title={it.summary}>{risk ? "Ризик" : "Увага"} · {it.summary}</span>
            </span>
            <span className="nd-sig-go" aria-hidden="true">→</span>
          </button>
        );
      })}
      <button type="button" className="nd-sig info" onClick={() => onOpen({ kind: "today", branch: null, scope: "now" })}>
        <span className="nd-sig-dot" aria-hidden="true" />
        <span className="nd-sig-body">
          <b>{scheduled > 0 ? `${countLessons(scheduled)} за розкладом` : "Сьогодні уроків немає"}</b>
          {scheduled > 0 && <span>Сьогодні · {formatNumber(done)} проведено</span>}
        </span>
        <span className="nd-sig-go" aria-hidden="true">→</span>
      </button>
      {others.length > SHOWN_OTHER && (
        <button type="button" className="link nd-now-all" onClick={() => onOpen({ kind: "attention", branch: null, scope: "now" })}>
          Переглянути всі ({formatNumber(others.length + (unmarkedTotal > 0 ? 1 : 0))})
        </button>
      )}
    </div>
  );
}
