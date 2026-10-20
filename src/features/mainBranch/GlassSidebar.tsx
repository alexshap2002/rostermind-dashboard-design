import { formatNumber, pluralUk } from "../../lib/format";
import { IconDownload } from "../../lib/icons";
import type { MainBranchFilters } from "./api";

export type PresetKey = "today" | "week" | "month" | "prev";
export interface PresetItem { key: PresetKey; label: string; meta: string }
export type BranchTone = "ok" | "warn" | "risk";
export interface SidebarBranch { id: number; name: string; students: number | null; tone: BranchTone; status: string }

interface Props {
  presets: PresetItem[];
  preset: PresetKey | "custom";
  onPreset: (key: PresetKey) => void;
  onCustom: () => void;
  filters: MainBranchFilters;
  onRange: (range: { dateFrom: string; dateTo: string }) => void;
  branches: SidebarBranch[];
  branchesLoading: boolean;
  onToggleBranch: (id: number) => void;
  onAllBranches: () => void;
  totalStudents: number | null;
  updatedAt: string | null;
  onRefresh: () => void;
  canExport: boolean;
  downloading: boolean;
  onExport: () => void;
}

/** Ліва скляна панель: період списком, філії з лічильниками й станом, дії внизу.
    На вузькому екрані та сама розмітка стає рядками чипів зверху (лише CSS). */
export function GlassSidebar({
  presets, preset, onPreset, onCustom, filters, onRange,
  branches, branchesLoading, onToggleBranch, onAllBranches, totalStudents,
  updatedAt, onRefresh, canExport, downloading, onExport,
}: Props) {
  const all = filters.branchIds.length === 0;
  return (
    <aside className="nd-side" aria-label="Період і філії">
      <section className="nd-side-block">
        <h3 className="nd-side-title">Період</h3>
        <div className="nd-side-list" role="radiogroup" aria-label="Період">
          {presets.map((p) => (
            <button key={p.key} type="button" role="radio" aria-checked={preset === p.key} className={`nd-side-item nd-preset${preset === p.key ? " on" : ""}`} onClick={() => onPreset(p.key)}>
              <span className="nd-side-label">{p.label}</span>
              <span className="nd-side-meta">{p.meta}</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={preset === "custom"} className={`nd-side-item nd-preset${preset === "custom" ? " on" : ""}`} onClick={onCustom}>
            <span className="nd-side-label">Свій період</span>
          </button>
        </div>
        {preset === "custom" && (
          <div className="nd-dates">
            <label><span>Від</span><input type="date" value={filters.dateFrom} max={filters.dateTo} onChange={(e) => e.target.value && onRange({ dateFrom: e.target.value, dateTo: filters.dateTo })} /></label>
            <label><span>До</span><input type="date" value={filters.dateTo} min={filters.dateFrom} onChange={(e) => e.target.value && onRange({ dateFrom: filters.dateFrom, dateTo: e.target.value })} /></label>
          </div>
        )}
      </section>

      <section className="nd-side-block">
        <h3 className="nd-side-title">Філії <span className="nd-side-count">{formatNumber(branches.length)}</span></h3>
        <div className="nd-side-list">
          <label className={`nd-side-item nd-side-check${all ? " on" : ""}`}>
            <input type="checkbox" checked={all} onChange={onAllBranches} />
            <span className="nd-side-name">Усі філії</span>
            <span className="nd-side-meta">{totalStudents === null ? (branchesLoading ? "…" : "—") : formatNumber(totalStudents)}</span>
          </label>
          {branches.map((b) => (
            <label key={b.id} className={`nd-side-item nd-side-check${!all && filters.branchIds.includes(b.id) ? " on" : ""}`} title={b.status}>
              <input type="checkbox" checked={!all && filters.branchIds.includes(b.id)} onChange={() => onToggleBranch(b.id)} />
              <span className={`nd-dot ${b.tone}`} aria-hidden="true" />
              <span className="nd-side-name">{b.name}<span className="sr-only"> — {b.status}</span></span>
              <span className="nd-side-meta">{b.students === null ? (branchesLoading ? "…" : "—") : formatNumber(b.students)}</span>
            </label>
          ))}
        </div>
        <p className="nd-side-hint">Число — діти в базі за період · крапка — стан філії</p>
      </section>

      <div className="nd-side-foot">
        <button type="button" className="btn ghost sm" onClick={onRefresh}>Оновити</button>
        {canExport && (
          <button type="button" className="btn ghost sm keep-label" disabled={downloading} onClick={onExport}>
            <IconDownload /><span>{downloading ? "Готуємо…" : "Excel"}</span>
          </button>
        )}
        {updatedAt && <span className="nd-side-updated">{updatedAt}</span>}
      </div>
      <span className="sr-only">{`${formatNumber(branches.length)} ${pluralUk(branches.length, "філія", "філії", "філій")}`}</span>
    </aside>
  );
}
