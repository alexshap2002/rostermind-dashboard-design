import { useState } from "react";
import { formatNumber, pluralUk } from "../../lib/format";
import { IconCheck, IconChevron, IconDownload } from "../../lib/icons";
import type { AttentionReport, BranchRow, MainBranchKpi, NetworkContext } from "./api";
import { UNMARKED_LESSON } from "./api";
import { countLessons, type Panel } from "./metrics";

const SHOWN_OTHER = 2;
/** Скільки філій називати в підрядку сигналу «не відмічено»; більше — лише кількість. */
const NAMED_BRANCHES = 3;

export interface PeriodOption { key: string; label: string; range: string; on: boolean; onPick: () => void }

interface Props {
  periods: PeriodOption[];
  custom: { on: boolean; dateFrom: string; dateTo: string; onPick: () => void; onRange: (r: { dateFrom: string; dateTo: string }) => void };
  /** «Цей місяць · 1–20 жовтня · Усі філії (3)» — підпис згорнутого блоку фільтрів на вузькому екрані. */
  summary: string;
  branches: NetworkContext["branches"];
  selected: number[];
  /** Рядки по всіх філіях за період (без фільтра) — щоб кількість дітей не зникала, коли філію знято з вибору. */
  rowsAll: BranchRow[] | undefined;
  /** Діти в базі по мережі з контракту (не сума рядків — сервер може дедуплікувати). */
  allStudents: number | undefined;
  onToggleBranch: (id: number) => void;
  onAllBranches: () => void;
  now: {
    today: MainBranchKpi | undefined;
    /** Зведення за останні N днів по всіх філіях: невідмічені уроки — з нього, без пагінації. */
    recent: MainBranchKpi | undefined;
    attention: AttentionReport | undefined;
    days: number;
    loading: boolean;
    failed: boolean;
    onOpen: (panel: Panel) => void;
  };
  onRefresh: () => void;
  canExport: boolean;
  downloading: boolean;
  onExport: () => void;
}

/** Бічна панель консолі: сигнали «На зараз», період, філії, оновлення й експорт.
    На вузькому екрані «На зараз» лишається розгорнутим, а період і філії ховаються за одним рядком-кнопкою,
    щоб показники не з'їжджали за перший екран. */
export function ConsoleSidebar({
  periods, custom, summary, branches, selected, rowsAll, allStudents, onToggleBranch, onAllBranches, now, onRefresh, canExport, downloading, onExport,
}: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const byTenant = new Map((rowsAll ?? []).map((r) => [r.tenant_id, r]));
  // «Усі філії» — і коли вибір порожній, і коли позначено кожну філію вручну.
  const allSelected = selected.length === 0 || selected.length === branches.length;

  return (
    <aside className="nd-side" aria-label="Сигнали, період і філії">
      <section className="nd-side-block" aria-labelledby="nd-side-now">
        <h3 className="nd-side-title" id="nd-side-now">На зараз <span>{formatNumber(now.days)} {pluralUk(now.days, "день", "дні", "днів")}</span></h3>
        <NowList {...now} />
      </section>

      <button
        type="button"
        className="nd-side-toggle"
        aria-expanded={filtersOpen}
        aria-controls="nd-side-filters"
        onClick={() => setFiltersOpen((v) => !v)}
      >
        <span className="nd-side-toggle-label">Період і філії</span>
        <span className="nd-side-toggle-value">{summary}</span>
        <IconChevron className="nd-side-toggle-chev" aria-hidden="true" />
      </button>

      <div id="nd-side-filters" className={`nd-side-filters${filtersOpen ? " open" : ""}`}>
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
            {/* Числа праворуч — діти в базі на кінець обраного періоду; сигнали за 30 днів живуть лише в «На зараз». */}
            <h3 className="nd-side-title" id="nd-side-branches">Філії <span>діти в базі</span></h3>
            <div className="nd-checks">
              <label className={`nd-check${allSelected ? " is-all" : ""}`}>
                <input type="checkbox" checked={allSelected} disabled={allSelected} onChange={onAllBranches} />
                <span className="nd-check-name">Усі філії</span>
                {allStudents !== undefined && <span className="nd-check-meta">{formatNumber(allStudents)}</span>}
              </label>
              {branches.map((b) => {
                const row = byTenant.get(b.tenant_id);
                return (
                  <label key={b.tenant_id} className="nd-check">
                    <input type="checkbox" checked={selected.includes(b.tenant_id)} onChange={() => onToggleBranch(b.tenant_id)} />
                    <span className="nd-check-name">{b.tenant_name}</span>
                    {row && <span className="nd-check-meta">{formatNumber(row.students_total)}</span>}
                  </label>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <div className="nd-side-foot">
        <button type="button" className="btn ghost" onClick={onRefresh}>Оновити</button>
        {canExport && (
          <button type="button" className="btn ghost keep-label" disabled={downloading} onClick={onExport}>
            <IconDownload /><span>{downloading ? "Готуємо…" : "Excel"}</span>
          </button>
        )}
      </div>
    </aside>
  );
}

/** Сигнали на зараз: уся мережа, останні N днів — не залежать від обраного періоду.
    Кожен відкриває свою вибірку в бічній панелі показника. */
function NowList({ today, recent, attention, loading, failed, onOpen }: Props["now"]) {
  const unmarkedTotal = recent?.lessons_unmarked_overdue ?? 0;
  const unmarkedRows = (recent?.branch_rows ?? []).filter((r) => r.lessons_unmarked_overdue > 0);
  const others = (attention?.items ?? []).filter((it) => it.anomaly_type !== UNMARKED_LESSON);
  const scheduled = today?.lessons_scheduled ?? 0;
  const done = today?.lessons_completed ?? 0;

  if (loading) {
    return <div className="nd-sigs"><span className="nd-skel" style={{ width: "90%" }} /><span className="nd-skel" style={{ width: "70%" }} /></div>;
  }
  if (failed) {
    // Помилка — не «усе спокійно»: без даних спокою не обіцяємо.
    return (
      <div className="nd-sigs">
        <div className="nd-sig"><span className="nd-sig-dot" aria-hidden="true" /><span className="nd-sig-body"><b>Сигнали не завантажено</b><span>Натисніть «Спробувати ще» вище</span></span></div>
      </div>
    );
  }
  const unmarkedWhere = unmarkedRows.length <= NAMED_BRANCHES
    ? unmarkedRows.map((r) => `${r.tenant_name} ${formatNumber(r.lessons_unmarked_overdue)}`).join(", ")
    : `${formatNumber(unmarkedRows.length)} ${pluralUk(unmarkedRows.length, "філія", "філії", "філій")}`;
  return (
    <div className="nd-sigs">
      {unmarkedTotal > 0 ? (
        <button type="button" className="nd-sig warn" onClick={() => onOpen({ kind: "unmarked", branch: null, scope: "now" })}>
          <span className="nd-sig-dot" aria-hidden="true" />
          <span className="nd-sig-body">
            <b>{countLessons(unmarkedTotal)} не відмічено</b>
            <span>Увага · {unmarkedWhere}</span>
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
