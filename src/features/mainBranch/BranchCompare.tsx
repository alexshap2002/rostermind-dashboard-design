import type { ReactNode } from "react";
import { formatCurrency, formatNumber, formatPercent, pluralUk } from "../../lib/format";
import { IconAlert } from "../../lib/icons";
import { ANOMALY_LABELS, UNMARKED_LESSON, type AttentionItem, type BranchRow } from "./api";
import { Delta, isRisk, lowerFirst, networkTotals, panelForAnomaly, severityRank, type Panel, type PanelKind } from "./metrics";
import { SortTh, useSort } from "./sort";

interface Props {
  rows: BranchRow[];
  /** Сигнали уваги за обраний період (звіт attention сервера) — по всіх вибраних філіях. */
  attention: AttentionItem[];
  loading: boolean;
  canEnter: boolean;
  busyId: number | null;
  onOpen: (panel: Panel) => void;
  onEnter: (row: BranchRow) => void;
}

/** Скільки сигналів показувати в колонці «Увага» текстом; решта — «ще N сигналів». */
const SHOWN_SIGNALS = 2;

interface Signal { key: string; text: string; risk: boolean; rank: number; panel: Panel }

/** Сигнали філії за період — без власних порогів на фронтенді: невідмічені уроки з рядка KPI
    (та сама колонка даних, що й у підсумку), решта — готові типи зі звіту attention,
    згорнуті за типом і впорядковані за рівнем (api.ts SEVERITY). */
function branchSignals(r: BranchRow, items: AttentionItem[]): Signal[] {
  const out: Signal[] = [];
  if (r.lessons_unmarked_overdue > 0) {
    out.push({
      key: UNMARKED_LESSON, text: `${formatNumber(r.lessons_unmarked_overdue)} не відмічено`, risk: false,
      rank: severityRank("warning"), panel: panelForAnomaly(UNMARKED_LESSON, r.tenant_id, "period"),
    });
  }
  const byType = new Map<string, { n: number; severity: string }>();
  for (const it of items) {
    if (it.tenant_id !== r.tenant_id || it.anomaly_type === UNMARKED_LESSON) continue;
    const cur = byType.get(it.anomaly_type);
    if (!cur) byType.set(it.anomaly_type, { n: 1, severity: it.severity });
    else {
      cur.n += 1;
      if (severityRank(it.severity) < severityRank(cur.severity)) cur.severity = it.severity;
    }
  }
  for (const [type, x] of byType) {
    const label = lowerFirst(ANOMALY_LABELS[type] ?? type);
    out.push({
      key: type, text: x.n > 1 ? `${label} (${formatNumber(x.n)})` : label, risk: isRisk(x.severity),
      rank: severityRank(x.severity), panel: panelForAnomaly(type, r.tenant_id, "period"),
    });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

/** Порівняння філій — головний робочий блок. Клітинка відкриває той самий показник лише цієї філії,
    назва — «Огляд філії» в аналітиці мережі, а «Працювати у філії» змінює робочий контекст. */
export function BranchCompare({ rows, attention, loading, canEnter, busyId, onOpen, onEnter }: Props) {
  // «Увага» для сортування — кількість сигналів філії (невідмічені + решта типів зі звіту).
  const otherSignals = (tenantId: number) => attention.filter((it) => it.tenant_id === tenantId && it.anomaly_type !== UNMARKED_LESSON).length;
  const withAttention = rows.map((r) => ({ ...r, attention: r.lessons_unmarked_overdue + otherSignals(r.tenant_id) }));
  const sort = useSort(withAttention, "students_total", "desc");
  const netOther = attention.filter((it) => it.anomaly_type !== UNMARKED_LESSON).length;
  const net = networkTotals(rows);
  const cell = (kind: PanelKind, row: BranchRow, children: ReactNode, label: string) => (
    <button type="button" className="nd-cell" aria-label={`${label}: ${row.tenant_name}`} onClick={() => onOpen({ kind, branch: row.tenant_id, scope: "period" })}>
      {children}
    </button>
  );

  return (
    <div className="nd-card nd-branches">
      <div className="nd-table-scroll">
        <table className="nd-table">
          <caption className="sr-only">Порівняння філій за обраний період</caption>
          <thead>
            <tr>
              <SortTh sort={sort} field="tenant_name" defaultDir="asc">Філія</SortTh>
              <SortTh sort={sort} field="students_total" className="r">Діти в базі</SortTh>
              <SortTh sort={sort} field="students_new" className="r">Нові за період</SortTh>
              <SortTh sort={sort} field="lessons_completed" className="r">Проведено занять</SortTh>
              <SortTh sort={sort} field="attendance_rate_pct" className="r">Відвідуваність</SortTh>
              <SortTh sort={sort} field="payroll_uah" className="r">Нараховано</SortTh>
              <SortTh sort={sort} field="attention">Увага</SortTh>
              <th><span className="sr-only">Дії</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && [0, 1, 2].map((i) => (
              <tr key={i}><td colSpan={8}><span className="nd-skel" style={{ width: "100%" }} /></td></tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8}><div className="nd-empty">У вибраних немає активних філій</div></td></tr>
            )}
            {sort.sorted.map((r) => {
              const signals = branchSignals(r, attention);
              const extra = Math.max(0, signals.length - SHOWN_SIGNALS);
              return (
                <tr key={r.tenant_id}>
                  <th scope="row" data-label="Філія">
                    <button type="button" className="nd-branch-name" onClick={() => onOpen({ kind: "branch", branch: r.tenant_id, scope: "period" })}>
                      {r.tenant_name}
                      <span className="nd-branch-hint">Огляд філії</span>
                    </button>
                  </th>
                  <td className="r" data-label="Діти в базі">{cell("students", r, formatNumber(r.students_total), "Діти в базі")}</td>
                  <td className="r" data-label="Нові за період">
                    {cell("new", r, r.students_new > 0 ? `+${formatNumber(r.students_new)}` : "0", "Нові діти")}
                  </td>
                  <td className="r" data-label="Проведено занять">
                    {cell("lessons", r, <>{formatNumber(r.lessons_completed)}<span className="nd-of"> з {formatNumber(r.lessons_scheduled)}</span></>, "Заняття")}
                  </td>
                  <td className="r" data-label="Відвідуваність">
                    {cell("attendance", r, r.attendance_rate_pct === null ? <span className="nd-muted">немає занять</span> : (
                      <span className="nd-stack">
                        {formatPercent(r.attendance_rate_pct)}
                        <Delta value={r.attendance_change_pp} unit="pp" />
                      </span>
                    ), "Відвідуваність")}
                  </td>
                  <td className="r" data-label="Нараховано">{cell("payroll", r, `${formatCurrency(r.payroll_uah)} ₴`, "Нараховано зарплат")}</td>
                  <td data-label="Увага">
                    {signals.length === 0 ? (
                      <span className="nd-calm">—</span>
                    ) : (
                      <span className="nd-signals">
                        {signals.slice(0, SHOWN_SIGNALS).map((s) => (
                          <button key={s.key} type="button" className={`nd-sig${s.risk ? " risk" : ""}`} onClick={() => onOpen(s.panel)}>
                            <IconAlert aria-hidden="true" /><span className="sr-only">{s.risk ? "Важливо: " : "Перевірити: "}</span>{s.text}
                          </button>
                        ))}
                        {extra > 0 && (
                          <button type="button" className="nd-sig more" onClick={() => onOpen({ kind: "attention", branch: r.tenant_id, scope: "period" })}>
                            ще {formatNumber(extra)} {pluralUk(extra, "сигнал", "сигнали", "сигналів")}
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="nd-act">
                    {canEnter && (
                      <button type="button" className="nd-work-btn" disabled={busyId !== null} onClick={() => onEnter(r)}>
                        {busyId === r.tenant_id ? "Переходимо…" : "Працювати у філії →"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr>
                <th scope="row" data-label="Філія">Уся мережа</th>
                <td className="r" data-label="Діти в базі">{formatNumber(net.students_total)}</td>
                <td className="r" data-label="Нові за період">{net.students_new > 0 ? `+${formatNumber(net.students_new)}` : "0"}</td>
                <td className="r" data-label="Проведено занять"><span>{formatNumber(net.lessons_completed)}<span className="nd-of"> з {formatNumber(net.lessons_scheduled)}</span></span></td>
                <td className="r" data-label="Відвідуваність">{net.attendance_rate_pct === null ? "—" : formatPercent(net.attendance_rate_pct)}</td>
                <td className="r" data-label="Нараховано">{formatCurrency(net.payroll_uah)} ₴</td>
                <td data-label="Увага">
                  {[
                    net.lessons_unmarked_overdue > 0 ? `${formatNumber(net.lessons_unmarked_overdue)} не відмічено` : null,
                    netOther > 0 ? `${formatNumber(netOther)} ${pluralUk(netOther, "сигнал", "сигнали", "сигналів")}` : null,
                  ].filter(Boolean).join(" · ") || "—"}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
