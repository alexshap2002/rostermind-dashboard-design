import type { ReactNode } from "react";
import { useScrollShades } from "../../components/admin/useScrollShades";
import { formatCurrency, formatNumber, formatPercent, pluralUk } from "../../lib/format";
import { ANOMALY_LABELS, UNMARKED_LESSON, type AttentionItem, type BranchRow } from "./api";
import { Delta, networkTotals, type Panel, type PanelKind } from "./metrics";
import { SortTh, useSort } from "./sort";

interface Props {
  rows: BranchRow[];
  /** Сигнали уваги за обраний період (з серверного звіту) — підписуємо їх словами, а не лічильником. */
  attention: AttentionItem[];
  loading: boolean;
  canEnter: boolean;
  busyId: number | null;
  onOpen: (panel: Panel) => void;
  onEnter: (row: BranchRow) => void;
}

/** Скільки пігулок сигналів показувати в рядку; решта — «ще N сигналів». */
const SHOWN_SIGNALS = 2;
/** Типи сигналів, які відкривають розбивку відвідуваності; решта — список «Потребує уваги». */
const ATTENDANCE_TYPES = new Set(["ATTENDANCE_DROP", "CHRONIC_ABSENCE_CLUSTER", "NO_PRESENT_STUDENTS"]);
const isRisk = (severity: string) => severity === "critical" || severity === "high";

interface Signal { key: string; text: string; tone: "warn" | "risk"; kind: PanelKind; count: number }

/** Пігулки сигналів філії: невідмічені — з рядка KPI, решта — з серверного звіту уваги, згорнуті за типом. */
function branchSignals(row: BranchRow, items: AttentionItem[]): Signal[] {
  const signals: Signal[] = [];
  if (row.lessons_unmarked_overdue > 0) {
    signals.push({ key: UNMARKED_LESSON, text: `${formatNumber(row.lessons_unmarked_overdue)} не відмічено`, tone: "warn", kind: "unmarked", count: row.lessons_unmarked_overdue });
  }
  const groups = new Map<string, { count: number; risk: boolean }>();
  for (const it of items) {
    const g = groups.get(it.anomaly_type) ?? { count: 0, risk: false };
    g.count += 1;
    g.risk = g.risk || isRisk(it.severity);
    groups.set(it.anomaly_type, g);
  }
  for (const [type, g] of groups) {
    const label = ANOMALY_LABELS[type] ?? "Сигнал";
    signals.push({
      key: type, text: g.count > 1 ? `${formatNumber(g.count)} × ${label.toLowerCase()}` : label.toLowerCase(),
      tone: g.risk ? "risk" : "warn", kind: ATTENDANCE_TYPES.has(type) ? "attendance" : "attention", count: g.count,
    });
  }
  // Ризики — першими, щоб не ховались за «ще N».
  return signals.sort((a, b) => Number(b.tone === "risk") - Number(a.tone === "risk"));
}

/** Порівняння філій — головний робочий блок. Клітинка відкриває той самий показник лише цієї філії,
    назва — «Огляд філії» в аналітиці мережі, а «Працювати у філії» змінює робочий контекст. */
export function BranchCompare({ rows, attention, loading, canEnter, busyId, onOpen, onEnter }: Props) {
  const scrollRef = useScrollShades<HTMLDivElement>();
  const itemsByTenant = new Map<number, AttentionItem[]>();
  for (const it of attention) {
    if (it.anomaly_type === UNMARKED_LESSON) continue; // невідмічені вже є числом у рядку
    itemsByTenant.set(it.tenant_id, [...(itemsByTenant.get(it.tenant_id) ?? []), it]);
  }
  const withAttention = rows.map((r) => ({ ...r, attention: r.lessons_unmarked_overdue + (itemsByTenant.get(r.tenant_id)?.length ?? 0) }));
  const sort = useSort(withAttention, "students_total", "desc");
  const net = networkTotals(rows);
  // Ім'я кнопки складається з підпису, філії й самого числа — читач екрана чує показник, а не лише «переглянути».
  const cell = (kind: PanelKind, row: BranchRow, children: ReactNode, label: string) => (
    <button type="button" className="nd-cell" onClick={() => onOpen({ kind, branch: row.tenant_id, scope: "period" })}>
      <span className="sr-only">{label}, {row.tenant_name}: </span>
      {children}
    </button>
  );

  return (
    <div className="nd-card nd-branches">
      <div className="nd-table-scroll" ref={scrollRef}>
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
              <th className="nd-act"><span className="sr-only">Дії</span></th>
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
              const signals = branchSignals(r, itemsByTenant.get(r.tenant_id) ?? []);
              const shown = signals.slice(0, SHOWN_SIGNALS);
              const rest = signals.slice(SHOWN_SIGNALS).reduce((s, x) => s + x.count, 0);
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
                        <span className="nd-cell-u">{formatPercent(r.attendance_rate_pct)}</span>
                        <Delta value={r.attendance_change_pp} unit="pp" />
                      </span>
                    ), "Відвідуваність")}
                  </td>
                  <td className="r" data-label="Нараховано">{cell("payroll", r, `${formatCurrency(r.payroll_uah)} ₴`, "Нараховано зарплат")}</td>
                  <td data-label="Увага">
                    {signals.length === 0 ? (
                      <span className="nd-calm">спокійно</span>
                    ) : (
                      <span className="nd-signals">
                        {shown.map((s) => (
                          <button key={s.key} type="button" className={`nd-pill ${s.tone}`} onClick={() => onOpen({ kind: s.kind, branch: r.tenant_id, scope: "period" })}>
                            {s.text}
                          </button>
                        ))}
                        {rest > 0 && (
                          <button type="button" className="nd-pill" onClick={() => onOpen({ kind: "attention", branch: r.tenant_id, scope: "period" })}>
                            ще {formatNumber(rest)} {pluralUk(rest, "сигнал", "сигнали", "сигналів")}
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
                <td className="nd-act" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
