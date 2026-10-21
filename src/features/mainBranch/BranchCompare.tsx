import type { ReactNode } from "react";
import { formatCurrency, formatNumber, formatPercent, pluralUk } from "../../lib/format";
import { ANOMALY_LABELS, UNMARKED_LESSON, type AttentionItem, type BranchRow } from "./api";
import { Delta, networkTotals, SEVERITY_RANK, severityTag, type Panel, type PanelKind } from "./metrics";
import { SortTh, useSort } from "./sort";

interface Props {
  rows: BranchRow[];
  /** Сигнали уваги за обраний період (ті самі фільтри, що й у KPI). Невідмічені уроки серед них
      показуємо числом з рядка філії, а головний з решти — пігулкою з типом і тоном. */
  attentionItems: AttentionItem[];
  loading: boolean;
  /** Дані не завантажились — показуємо це, а не «немає активних філій». */
  error?: boolean;
  canEnter: boolean;
  busyId: number | null;
  onOpen: (panel: Panel) => void;
  onEnter: (row: BranchRow) => void;
  onRetry?: () => void;
}

type Signal = { text: string; kind: PanelKind; tone: "warn" | "risk" | "info" };

/** Порівняння філій — головний робочий блок. Клітинка відкриває той самий показник лише цієї філії,
    назва — «Огляд філії» в аналітиці мережі, а «Працювати у філії» змінює робочий контекст. */
export function BranchCompare({ rows, attentionItems, loading, error, canEnter, busyId, onOpen, onEnter, onRetry }: Props) {
  const byTenant = new Map<number, AttentionItem[]>();
  for (const it of attentionItems) byTenant.set(it.tenant_id, [...(byTenant.get(it.tenant_id) ?? []), it]);
  const othersOf = (tenantId: number) =>
    (byTenant.get(tenantId) ?? []).filter((it) => it.anomaly_type !== UNMARKED_LESSON)
      .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
  const withAttention = rows.map((r) => ({ ...r, attention: (byTenant.get(r.tenant_id) ?? []).length }));
  const sort = useSort(withAttention, "students_total", "desc");
  const net = networkTotals(rows);
  const tenantIds = new Set(rows.map((r) => r.tenant_id));
  const netOthers = attentionItems.filter((it) => it.anomaly_type !== UNMARKED_LESSON && tenantIds.has(it.tenant_id));
  const netRisk = netOthers.filter((it) => severityTag(it.severity).tone === "risk").length;
  const netWarn = netOthers.length - netRisk;
  const netSignals = [
    net.lessons_unmarked_overdue > 0 ? `${formatNumber(net.lessons_unmarked_overdue)} не відмічено` : null,
    netRisk > 0 ? `${formatNumber(netRisk)} ${pluralUk(netRisk, "ризик", "ризики", "ризиків")}` : null,
    netWarn > 0 ? `${formatNumber(netWarn)} ${pluralUk(netWarn, "сигнал уваги", "сигнали уваги", "сигналів уваги")}` : null,
  ].filter(Boolean);
  const cell = (kind: PanelKind, row: BranchRow, children: ReactNode, label: string) => (
    <button type="button" className="nd-cell" onClick={() => onOpen({ kind, branch: row.tenant_id, scope: "period" })}>
      <span className="sr-only">{row.tenant_name}, {label}: </span>
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
            {error && rows.length === 0 && (
              <tr><td colSpan={8}>
                <div className="nd-empty nd-err" role="status">
                  Не вдалося завантажити філії.{" "}
                  {onRetry && <button type="button" className="link" onClick={onRetry}>Спробувати ще</button>}
                </div>
              </td></tr>
            )}
            {!error && loading && rows.length === 0 && [0, 1, 2].map((i) => (
              <tr key={i}><td colSpan={8}><span className="nd-skel" style={{ width: "100%" }} /></td></tr>
            ))}
            {!error && !loading && rows.length === 0 && (
              <tr><td colSpan={8}><div className="nd-empty">У вибраних немає активних філій</div></td></tr>
            )}
            {sort.sorted.map((r) => {
              const others = othersOf(r.tenant_id);
              const top = others[0];
              const signals = [
                r.lessons_unmarked_overdue > 0 ? { text: `${formatNumber(r.lessons_unmarked_overdue)} не відмічено`, kind: "unmarked", tone: "warn" } : null,
                // Головний сигнал періоду — текстом за типом і тоном за важливістю, а не безликим «ще 1 сигнал».
                top ? { text: ANOMALY_LABELS[top.anomaly_type] ?? top.anomaly_type, kind: top.anomaly_type === "ATTENDANCE_DROP" ? "attendance" : "attention", tone: severityTag(top.severity).tone }
                  : r.attendance_change_pp !== null && r.attendance_change_pp <= -5 ? { text: "Відвідуваність падає", kind: "attendance", tone: "warn" } : null,
              ].filter(Boolean) as Signal[];
              const extra = Math.max(0, others.length - 1);
              return (
                <tr key={r.tenant_id}>
                  <th scope="row" data-label="Філія">
                    <button type="button" className="nd-branch-name" onClick={() => onOpen({ kind: "branch", branch: r.tenant_id, scope: "period" })}>
                      {r.tenant_name}
                      <span className="nd-branch-hint">Огляд філії</span>
                    </button>
                  </th>
                  <td className="r" data-label="Діти в базі">{cell("students", r, formatNumber(r.students_total), "діти в базі")}</td>
                  <td className="r" data-label="Нові за період">
                    {cell("new", r, r.students_new > 0 ? `+${formatNumber(r.students_new)}` : "0", "нові за період")}
                  </td>
                  <td className="r" data-label="Проведено занять">
                    {cell("lessons", r, <>{formatNumber(r.lessons_completed)}<span className="nd-of"> з {formatNumber(r.lessons_scheduled)}</span></>, "проведено занять")}
                  </td>
                  <td className="r" data-label="Відвідуваність">
                    {cell("attendance", r, r.attendance_rate_pct === null ? <span className="nd-muted">немає занять</span> : (
                      <span className="nd-stack">
                        {formatPercent(r.attendance_rate_pct)}
                        <Delta value={r.attendance_change_pp} unit="pp" />
                      </span>
                    ), "відвідуваність")}
                  </td>
                  <td className="r" data-label="Нараховано">{cell("payroll", r, `${formatCurrency(r.payroll_uah)} ₴`, "нараховано зарплат")}</td>
                  <td data-label="Увага">
                    {signals.length === 0 ? (
                      <span className="nd-calm">—</span>
                    ) : (
                      <span className="nd-signals">
                        {signals.map((s) => (
                          <button key={s.kind} type="button" className={`nd-pill ${s.tone}`} onClick={() => onOpen({ kind: s.kind, branch: r.tenant_id, scope: "period" })}>
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
                <th scope="row">Уся мережа</th>
                <td className="r" data-label="Діти в базі">{formatNumber(net.students_total)}</td>
                <td className="r" data-label="Нові за період">{net.students_new > 0 ? `+${formatNumber(net.students_new)}` : "0"}</td>
                <td className="r" data-label="Проведено занять"><span>{formatNumber(net.lessons_completed)}<span className="nd-of"> з {formatNumber(net.lessons_scheduled)}</span></span></td>
                <td className="r" data-label="Відвідуваність">{net.attendance_rate_pct === null ? "—" : formatPercent(net.attendance_rate_pct)}</td>
                <td className="r" data-label="Нараховано">{formatCurrency(net.payroll_uah)} ₴</td>
                <td data-label="Увага">{netSignals.length ? netSignals.join(" · ") : "—"}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
    </div>
  );
}
