import { useEffect, useState, type ReactNode } from "react";
import { formatNumber, pluralUk } from "../../lib/format";
import {
  IconActivity, IconBars, IconBranches, IconCheckSquare, IconDownload, IconHome, IconMoney, IconSparkle,
} from "../../lib/icons";
import type { BranchRow, MainBranchFilters } from "./api";
import type { PanelKind } from "./metrics";

export type Section = "top" | "branches" | "trend" | "reports";

export interface PresetItem { key: string; label: string; range: string }

interface Props {
  section: Section;
  onJump: (section: Section) => void;
  onPanel: (kind: PanelKind) => void;
  presets: PresetItem[];
  preset: string;
  /** «Цей місяць · 1–20 жовтня» — для згорнутого рядка на вузькому екрані. */
  periodLabel: string;
  branchesLabel: string;
  onPreset: (key: string) => void;
  onCustom: () => void;
  filters: MainBranchFilters;
  onRange: (range: { dateFrom: string; dateTo: string }) => void;
  branches: Array<{ tenant_id: number; tenant_name: string }>;
  /** Рядки за той самий період без фільтра філій — кількість дітей не зникає, коли філію знято з вибору. */
  rowsAll: BranchRow[];
  /** Невідмічені уроки по філіях за ті самі `nowDays` днів, що й картка «На зараз» (не за обраний період). */
  unmarkedNow: Map<number, number>;
  nowDays: number;
  onToggleBranch: (id: number) => void;
  onAllBranches: () => void;
  onRefresh: () => void;
  canExport: boolean;
  exporting: boolean;
  onExport: () => void;
}

/** Вузький екран (≤ 1100 px): панель стає блоком над даними, період і філії — згорнуті рядки. */
function useNarrow(query = "(max-width: 1100px)"): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

/** Блок панелі: на широкому екрані — секція з підписом, на вузькому — <details> з підсумком у рядку. */
function Block({ narrow, id, title, summary, children }: {
  narrow: boolean; id: string; title: string; summary: ReactNode; children: ReactNode;
}) {
  if (!narrow) {
    return (
      <section className="nd-nav-block" aria-labelledby={id}>
        <h4 id={id}>{title}</h4>
        {children}
      </section>
    );
  }
  return (
    <details className="nd-nav-block nd-fold">
      <summary><span className="nd-fold-k">{title}</span><b>{summary}</b></summary>
      <div className="nd-fold-body">{children}</div>
    </details>
  );
}

/** Ліва панель консолі: розділи сторінки, показники (відкривають бічну панель), період і філії, дії. */
export function NeonNav(p: Props) {
  const narrow = useNarrow();
  const total = p.rowsAll.reduce((s, r) => s + r.students_total, 0);
  const rowOf = (id: number) => p.rowsAll.find((r) => r.tenant_id === id);
  const windowText = `за останні ${formatNumber(p.nowDays)} ${pluralUk(p.nowDays, "день", "дні", "днів")}`;
  const jump = (key: Section, icon: ReactNode, label: string) => (
    <li key={key}>
      <button type="button" className={`nd-nav-item${p.section === key ? " on" : ""}`} aria-current={p.section === key ? "location" : undefined} onClick={() => p.onJump(key)}>
        {icon}<span>{label}</span>
      </button>
    </li>
  );
  const panel = (key: PanelKind, icon: ReactNode, label: string) => (
    <li key={key}>
      <button type="button" className="nd-nav-item panel" onClick={() => p.onPanel(key)}>
        {icon}<span>{label}</span><span className="nd-nav-go" aria-hidden="true">→</span>
        <span className="sr-only">— відкрити розбивку по філіях</span>
      </button>
    </li>
  );
  const radio = (key: string, checked: boolean, onChange: () => void, label: string, range?: string) => (
    <label key={key} className={`nd-period-opt${checked ? " on" : ""}`}>
      <input type="radio" name="nd-period" className="sr-only" checked={checked} onChange={onChange} />
      <span className="nd-period-btn">
        <span>{label}</span>
        {range && <span className="nd-period-range">{range}</span>}
      </span>
    </label>
  );

  return (
    <nav className="nd-nav" aria-label="Навігація дашбордом мережі">
      <div className="nd-brand">
        <span className="nd-brand-ic" aria-hidden="true"><IconBranches /></span>
        <span className="nd-brand-text"><b>RosterMind</b><span>мережа шкіл</span></span>
      </div>

      <ul className="nd-nav-list" aria-label="Розділи сторінки">
        {jump("top", <IconHome />, "Огляд")}
        {jump("branches", <IconBranches />, "Філії")}
        {jump("trend", <IconBars />, "Динаміка")}
        {jump("reports", <IconSparkle />, "Звіти")}
      </ul>

      <section className="nd-nav-block nd-nav-panels" aria-labelledby="nd-panels-title">
        <h4 id="nd-panels-title">Показники <span className="nd-meta">по філіях →</span></h4>
        <ul className="nd-nav-list">
          {panel("lessons", <IconCheckSquare />, "Заняття")}
          {panel("attendance", <IconActivity />, "Відвідуваність")}
          {panel("payroll", <IconMoney />, "Зарплати")}
        </ul>
      </section>

      <Block narrow={narrow} id="nd-period-title" title="Період" summary={p.periodLabel}>
        <fieldset className="nd-period">
          <legend className="sr-only">Період</legend>
          {p.presets.map((x) => radio(x.key, p.preset === x.key, () => p.onPreset(x.key), x.label, x.range))}
          {radio("custom", p.preset === "custom", p.onCustom, "Свій період")}
        </fieldset>
        {p.preset === "custom" && (
          <div className="nd-dates">
            <label><span>Від</span><input type="date" value={p.filters.dateFrom} max={p.filters.dateTo} onChange={(e) => e.target.value && p.onRange({ dateFrom: e.target.value, dateTo: p.filters.dateTo })} /></label>
            <label><span>До</span><input type="date" value={p.filters.dateTo} min={p.filters.dateFrom} onChange={(e) => e.target.value && p.onRange({ dateFrom: p.filters.dateFrom, dateTo: e.target.value })} /></label>
          </div>
        )}
      </Block>

      <Block narrow={narrow} id="nd-branches-title" title="Філії" summary={p.branchesLabel}>
        <div className="nd-checks">
          <label className="nd-check">
            <input type="checkbox" checked={p.filters.branchIds.length === 0} onChange={p.onAllBranches} />
            <span className="nd-check-name">Усі філії</span>
            <span className="nd-check-n" title="дітей у базі">{p.rowsAll.length ? formatNumber(total) : ""}</span>
          </label>
          {p.branches.map((b) => {
            const row = rowOf(b.tenant_id);
            const unmarked = p.unmarkedNow.get(b.tenant_id) ?? 0;
            const unmarkedText = `${formatNumber(unmarked)} ${pluralUk(unmarked, "урок", "уроки", "уроків")} не відмічено ${windowText}`;
            return (
              <label key={b.tenant_id} className="nd-check">
                <input type="checkbox" checked={p.filters.branchIds.includes(b.tenant_id)} onChange={() => p.onToggleBranch(b.tenant_id)} />
                <span className="nd-check-name">{b.tenant_name}</span>
                {unmarked > 0 && (
                  <span className="nd-pill warn sm" title={unmarkedText}>
                    {formatNumber(unmarked)}<span className="sr-only"> {unmarkedText.slice(unmarkedText.indexOf(" ") + 1)}</span>
                  </span>
                )}
                <span className="nd-check-n" title="дітей у базі">{row ? formatNumber(row.students_total) : ""}</span>
              </label>
            );
          })}
        </div>
        {p.unmarkedNow.size > 0 && (
          <p className="nd-nav-hint" aria-hidden="true">жовта пігулка — уроки не відмічено {windowText}, як у «На зараз»</p>
        )}
      </Block>

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
