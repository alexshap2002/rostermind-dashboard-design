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

/** Порівняння філій — головний робочий блок. Під кожним числом — смужка відносно найбільшої філії
    (відвідуваність — відносно 100 %), щоб різницю було видно без читання цифр.
    Клітинка відкриває той самий показник лише цієї філії, назва — «Огляд філії» в аналітиці мережі,
    а «Працювати у філії» змінює робочий контекст. */
export function BranchCompare({ rows, attentionByTenant, loading, canEnter, busyId, onOpen, onEnter }: Props) {
  const withAttention = rows.map((r) => ({ ...r, attention: attentionByTenant[String(r.tenant_id)] ?? 0 }));
  const sort = useSort(withAttention, "students_total", "desc");
  const net = networkTotals(rows);
  const top = (key: keyof BranchRow) => Math.max(1, ...rows.map((r) => Number(r[key] ?? 0)));
  const max = { students: top("students_total"), fresh: top("students_new"), lessons: top("lessons_completed"), pay: top("payroll_uah") };

  const meter = (value: number, of: number, cls = "") => (
    <span className={`nd-meter${cls ? ` ${cls}` : ""}`} aria-hidden="true">
      <i style={{ width: `${Math.max(0, Math.min(100, Math.round((value / of) * 100)))}%` }} />
    </span>
  );
  const cell = (kind: PanelKind, row: BranchRow, label: string, children: ReactNode) => (
    <button type="button" className="nd-cell" onClick={() => onOpen({ kind, branch: row.tenant_id, scope: "period" })}>
      <span className="sr-only">{label}, {row.tenant_name}: </span>
      {children}
    </button>
  );

  return (
    <div className="nd-card nd-branches">
      <div className="nd-table-scroll">
        <table className="nd-table nd-compare">
          <caption className="sr-only">Порівняння філій за обраний період</caption>
          <thead>
            <tr>
              <SortTh sort={sort} field="tenant_name" defaultDir="asc">Філія</SortTh>
              <SortTh sort={sort} field="students_total">Діти в базі</SortTh>
              <SortTh sort={sort} field="students_new">Нові за період</SortTh>
              <SortTh sort={sort} field="lessons_completed">Проведено занять</SortTh>
              <SortTh sort={sort} field="attendance_rate_pct">Відвідуваність</SortTh>
              <SortTh sort={sort} field="payroll_uah">Нараховано</SortTh>
              <SortTh sort={sort} field="attention">Увага</SortTh>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && [0, 1, 2].map((i) => (
              <tr key={i}><td colSpan={7}><span className="nd-skel" style={{ width: "100%" }} /></td></tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7}><div className="nd-empty">У вибраних немає активних філій</div></td></tr>
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
                    <div className="nd-branch">
                      <button type="button" className="nd-branch-name" onClick={() => onOpen({ kind: "branch", branch: r.tenant_id, scope: "period" })}>
                        {r.tenant_name}<span className="sr-only"> — огляд філії</span>
                      </button>
                      <div className="nd-branch-links">
                        <button type="button" className="nd-textlink" onClick={() => onOpen({ kind: "branch", branch: r.tenant_id, scope: "period" })}>Огляд філії</button>
                        {canEnter && (
                          <button type="button" className="nd-textlink" disabled={busyId !== null} onClick={() => onEnter(r)}>
                            {busyId === r.tenant_id ? "Переходимо…" : "Працювати у філії →"}
                          </button>
                        )}
                      </div>
                    </div>
                  </th>
                  <td data-label="Діти в базі">
                    {cell("students", r, "Діти в базі", <><b>{formatNumber(r.students_total)}</b>{meter(r.students_total, max.students)}</>)}
                  </td>
                  <td data-label="Нові за період">
                    {cell("new", r, "Нові діти", <><b>{r.students_new > 0 ? `+${formatNumber(r.students_new)}` : "0"}</b>{meter(r.students_new, max.fresh)}</>)}
                  </td>
                  <td data-label="Проведено занять">
                    {cell("lessons", r, "Заняття", <><b>{formatNumber(r.lessons_completed)}</b><span className="nd-of"> з {formatNumber(r.lessons_scheduled)}</span>{meter(r.lessons_completed, max.lessons)}</>)}
                  </td>
                  <td data-label="Відвідуваність">
                    {cell("attendance", r, "Відвідуваність", r.attendance_rate_pct === null ? <span className="nd-muted">немає занять</span> : (
                      <><b>{formatPercent(r.attendance_rate_pct)}</b> <Delta value={r.attendance_change_pp} unit="pp" />{meter(r.attendance_rate_pct, 100, "att")}</>
                    ))}
                  </td>
                  <td data-label="Нараховано">
                    {cell("payroll", r, "Нараховано зарплат", <><b>{formatCurrency(r.payroll_uah)} ₴</b>{meter(r.payroll_uah, max.pay)}</>)}
                  </td>
                  <td data-label="Увага">
                    {signals.length === 0 && extra === 0 ? (
                      <span className="nd-calm">спокійно</span>
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
                </tr>
              );
            })}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr>
                <th scope="row" data-label="Філія">Уся мережа</th>
                <td data-label="Діти в базі">{formatNumber(net.students_total)}</td>
                <td data-label="Нові за період">{net.students_new > 0 ? `+${formatNumber(net.students_new)}` : "0"}</td>
                <td data-label="Проведено занять"><span>{formatNumber(net.lessons_completed)}<span className="nd-of"> з {formatNumber(net.lessons_scheduled)}</span></span></td>
                <td data-label="Відвідуваність">{net.attendance_rate_pct === null ? "—" : formatPercent(net.attendance_rate_pct)}</td>
                <td data-label="Нараховано">{formatCurrency(net.payroll_uah)} ₴</td>
                <td data-label="Увага">{net.lessons_unmarked_overdue > 0 ? `${formatNumber(net.lessons_unmarked_overdue)} не відмічено` : "спокійно"}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
