import { formatNumber, pluralUk } from "../../lib/format";
import {
  IconActivity, IconAlert, IconBranches, IconCheckSquare, IconDownload, IconHome, IconMoney,
} from "../../lib/icons";
import type { BranchRow, MainBranchFilters } from "./api";
import type { PanelKind } from "./metrics";

export type Section = "top" | "branches" | "reports";

export interface PresetItem { key: string; label: string; range: string }

interface Props {
  section: Section;
  onJump: (section: Section, tab?: "problems") => void;
  onPanel: (kind: PanelKind) => void;
  presets: PresetItem[];
  preset: string;
  onPreset: (key: string) => void;
  onCustom: () => void;
  filters: MainBranchFilters;
  onRange: (range: { dateFrom: string; dateTo: string }) => void;
  branches: Array<{ tenant_id: number; tenant_name: string }>;
  /** Рядки за той самий період без фільтра філій — щоб лічильники не зникали, коли філію знято з вибору. */
  rowsAll: BranchRow[];
  onToggleBranch: (id: number) => void;
  onAllBranches: () => void;
  onRefresh: () => void;
  canExport: boolean;
  exporting: boolean;
  onExport: () => void;
}

/** Ліва панель консолі: навігація розділами, період і філії, дії. На вузькому екрані — рядки над даними. */
export function NeonNav(p: Props) {
  const total = p.rowsAll.reduce((s, r) => s + r.students_total, 0);
  const rowOf = (id: number) => p.rowsAll.find((r) => r.tenant_id === id);
  const nav = (key: Section | PanelKind, icon: React.ReactNode, label: string, onClick: () => void, active = false) => (
    <li key={key}>
      <button type="button" className={`nd-nav-item${active ? " on" : ""}`} aria-current={active ? "page" : undefined} onClick={onClick}>
        {icon}<span>{label}</span>
      </button>
    </li>
  );

  return (
    <nav className="nd-nav" aria-label="Навігація дашбордом мережі">
      <div className="nd-brand">
        <span className="nd-brand-ic" aria-hidden="true"><IconBranches /></span>
        <span className="nd-brand-text"><b>RosterMind</b><span>мережа шкіл</span></span>
      </div>

      <ul className="nd-nav-list">
        {nav("top", <IconHome />, "Огляд", () => p.onJump("top"), p.section === "top")}
        {nav("branches", <IconBranches />, "Філії", () => p.onJump("branches"), p.section === "branches")}
        {nav("lessons", <IconCheckSquare />, "Заняття", () => p.onPanel("lessons"))}
        {nav("attendance", <IconActivity />, "Відвідуваність", () => p.onPanel("attendance"))}
        {nav("payroll", <IconMoney />, "Зарплати", () => p.onPanel("payroll"))}
        {nav("reports", <IconAlert />, "Проблеми", () => p.onJump("reports", "problems"), p.section === "reports")}
      </ul>

      <section className="nd-nav-block" aria-labelledby="nd-period-title">
        <h4 id="nd-period-title">Період</h4>
        <div className="nd-period" role="radiogroup" aria-label="Період">
          {p.presets.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={p.preset === x.key} className={p.preset === x.key ? "on" : ""} onClick={() => p.onPreset(x.key)}>
              <span>{x.label}</span><span className="nd-period-range">{x.range}</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={p.preset === "custom"} className={p.preset === "custom" ? "on" : ""} onClick={p.onCustom}>
            <span>Свій період</span>
          </button>
        </div>
        {p.preset === "custom" && (
          <div className="nd-dates">
            <label><span>Від</span><input type="date" value={p.filters.dateFrom} max={p.filters.dateTo} onChange={(e) => e.target.value && p.onRange({ dateFrom: e.target.value, dateTo: p.filters.dateTo })} /></label>
            <label><span>До</span><input type="date" value={p.filters.dateTo} min={p.filters.dateFrom} onChange={(e) => e.target.value && p.onRange({ dateFrom: p.filters.dateFrom, dateTo: e.target.value })} /></label>
          </div>
        )}
      </section>

      <section className="nd-nav-block" aria-labelledby="nd-branches-title">
        <h4 id="nd-branches-title">Філії <span className="nd-meta">{formatNumber(p.branches.length)}</span></h4>
        <div className="nd-checks">
          <label className="nd-check">
            <input type="checkbox" checked={p.filters.branchIds.length === 0} onChange={p.onAllBranches} />
            <span className="nd-check-name">Усі філії</span>
            <span className="nd-check-n" title="дітей у базі">{p.rowsAll.length ? formatNumber(total) : ""}</span>
          </label>
          {p.branches.map((b) => {
            const row = rowOf(b.tenant_id);
            const unmarked = row?.lessons_unmarked_overdue ?? 0;
            return (
              <label key={b.tenant_id} className="nd-check">
                <input type="checkbox" checked={p.filters.branchIds.includes(b.tenant_id)} onChange={() => p.onToggleBranch(b.tenant_id)} />
                <span className="nd-check-name">{b.tenant_name}</span>
                {unmarked > 0 && <span className="nd-pill warn sm" title={`${unmarked} ${pluralUk(unmarked, "урок", "уроки", "уроків")} не відмічено`}>{formatNumber(unmarked)}</span>}
                <span className="nd-check-n" title="дітей у базі">{row ? formatNumber(row.students_total) : ""}</span>
              </label>
            );
          })}
        </div>
      </section>

      <div className="nd-nav-foot">
        <button type="button" className="btn ghost sm" onClick={p.onRefresh}>Оновити</button>
        {p.canExport && (
          <button type="button" className="btn ghost sm keep-label" disabled={p.exporting} onClick={p.onExport}>
            <IconDownload /><span>{p.exporting ? "Готуємо…" : "Excel"}</span>
          </button>
        )}
      </div>
    </nav>
  );
}
