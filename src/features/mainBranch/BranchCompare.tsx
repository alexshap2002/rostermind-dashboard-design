import type { ReactNode } from "react";
import { formatCurrency, formatNumber, formatPercent, pluralUk } from "../../lib/format";
import type { BranchRow } from "./api";
import { Delta, networkTotals, type Panel, type PanelKind } from "./metrics";
import { SortTh, useSort } from "./sort";

interface Props {
  rows: BranchRow[];
  /** Сигнали уваги за обраний період по філіях (крім невідмічених — вони в окремій колонці даних). */
  attentionByTenant: Record<string, number>;
  loading: boolean;
  canEnter: boolean;
  busyId: number | null;
  onOpen: (panel: Panel) => void;
  onEnter: (row: BranchRow) => void;
}

/** Порівняння філій — головний робочий блок. Клітинка відкриває той самий показник лише цієї філії,
    назва — «Огляд філії» в аналітиці мережі, а «Працювати у філії» змінює робочий контекст. */
export function BranchCompare({ rows, attentionByTenant, loading, canEnter, busyId, onOpen, onEnter }: Props) {
  const withAttention = rows.map((r) => ({ ...r, attention: attentionByTenant[String(r.tenant_id)] ?? 0 }));
  const sort = useSort(withAttention, "students_total", "desc");
  const net = networkTotals(rows);
  const cell = (kind: PanelKind, row: BranchRow, children: ReactNode, label: string) => (
    <button type="button" className="nd-cell" aria-label={`${label}: ${row.tenant_name}`} onClick={() => onOpen({ kind, branch: row.tenant_id, scope: "period" })}>
      {children}
    </button>
  );

  return (
    <div className="nd-table-scroll">
        <table className="nd-table nd-branches-table">
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
              const signals = [
                r.lessons_unmarked_overdue > 0 ? { text: `${formatNumber(r.lessons_unmarked_overdue)} не відмічено`, kind: "unmarked" as const } : null,
                r.attendance_change_pp !== null && r.attendance_change_pp <= -5 ? { text: "відвідуваність падає", kind: "attendance" as const } : null,
              ].filter(Boolean) as { text: string; kind: PanelKind }[];
              // Сигнали періоду містять і кожен невідмічений урок окремо — їх уже показано числом вище.
              const extra = Math.max(0, r.attention - r.lessons_unmarked_overdue - (signals.some((x) => x.kind === "attendance") ? 1 : 0));
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
                    {signals.length === 0 && extra === 0 ? (
                      <span className="nd-calm">—</span>
                    ) : (
                      <span className="nd-signals">
                        {signals.map((s) => (
                          <button key={s.kind} type="button" className={`nd-pill ${s.kind === "attendance" ? "risk" : "warn"}`} onClick={() => onOpen({ kind: s.kind, branch: r.tenant_id, scope: "period" })}>
                            {s.text}
                          </button>
                        ))}
                        {extra > 0 && (
                          <button type="button" className="nd-pill" onClick={() => onOpen({ kind: "attention", branch: r.tenant_id, scope: "period" })}>
                            ще {formatNumber(extra)} {pluralUk(extra, "сигнал", "сигнали", "сигналів")}
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="nd-act">
                    {canEnter && (
                      <button type="button" className="btn ghost sm" disabled={busyId !== null} onClick={() => onEnter(r)}>
                        {busyId === r.tenant_id ? "Переходимо…" : "Працювати у філії"}
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
                <td data-label="Увага">{net.lessons_unmarked_overdue > 0 ? `${formatNumber(net.lessons_unmarked_overdue)} не відмічено` : "—"}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
    </div>
  );
}
