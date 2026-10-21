import type { ReactNode } from "react";
import { useScrollShades } from "../../components/admin/useScrollShades";
import { formatCurrency, formatNumber, formatPercent, pluralUk } from "../../lib/format";
import { ANOMALY_LABELS, UNMARKED_LESSON, type BranchRow } from "./api";
import { Delta, networkTotals, signalPanelKind, signalTone, type Panel, type PanelKind, type SignalsState } from "./metrics";
import { SortTh, useSort } from "./sort";

const SHOWN_SIGNALS = 1;

interface Props {
  rows: BranchRow[];
  /** Сигнали уваги за обраний період або стан запиту — ті самі, що й у картках. */
  signals: SignalsState;
  loading: boolean;
  onOpen: (panel: Panel) => void;
}

/** Порівняння філій рядками — щоб сортувати й звіряти підсумок (головний блок варіанту — картки вище).
    Клітинка відкриває той самий показник лише цієї філії, назва — «Огляд філії» в аналітиці мережі.
    «Працювати у філії» тут не дублюємо — ця дія є в кожній картці й у панелі огляду. */
export function BranchCompare({ rows, signals, loading, onOpen }: Props) {
  const items = Array.isArray(signals) ? signals : null;
  const signalsOf = (tenantId: number) => (items ?? []).filter((it) => it.tenant_id === tenantId && it.anomaly_type !== UNMARKED_LESSON);
  // «Увага» для сортування: невідмічені уроки + решта сигналів періоду.
  const withAttention = rows.map((r) => ({ ...r, attention: r.lessons_unmarked_overdue + signalsOf(r.tenant_id).length }));
  const sort = useSort(withAttention, "students_total", "desc");
  const net = networkTotals(rows);
  // Тінь на правому краю, коли частина колонок схована за прокруткою
  const scrollRef = useScrollShades<HTMLDivElement>();
  const cell = (kind: PanelKind, row: BranchRow, children: ReactNode, label: string) => (
    <button type="button" className="nd-cell" onClick={() => onOpen({ kind, branch: row.tenant_id, scope: "period" })}>
      <span className="sr-only">{row.tenant_name}, {label}: </span>{children}
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
              const own = signalsOf(r.tenant_id);
              const shown: { text: string; kind: PanelKind; tone: "warn" | "risk"; title?: string }[] = [
                ...(r.lessons_unmarked_overdue > 0 ? [{ text: `${formatNumber(r.lessons_unmarked_overdue)} не відмічено`, kind: "unmarked" as const, tone: "warn" as const }] : []),
                ...own.slice(0, SHOWN_SIGNALS).map((it) => ({ text: ANOMALY_LABELS[it.anomaly_type] ?? it.summary, kind: signalPanelKind(it), tone: signalTone(it), title: it.summary })),
              ];
              const extra = Math.max(0, own.length - SHOWN_SIGNALS);
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
                    {shown.length === 0 && extra === 0 ? (
                      items === null
                        ? <span className="nd-calm">{signals === "loading" ? "вантажаться…" : signals === "error" ? "не завантажено" : "—"}</span>
                        : <span className="nd-calm" title="Сигналів за період немає">—</span>
                    ) : (
                      <span className="nd-signals">
                        {shown.map((s) => (
                          <button key={s.kind} type="button" className={`nd-pill ${s.tone}`} title={s.title} onClick={() => onOpen({ kind: s.kind, branch: r.tenant_id, scope: "period" })}>
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
                <td className="r" data-label="Діти в базі">{formatNumber(net.students_total)}</td>
                <td className="r" data-label="Нові за період">{net.students_new > 0 ? `+${formatNumber(net.students_new)}` : "0"}</td>
                <td className="r" data-label="Проведено занять"><span>{formatNumber(net.lessons_completed)}<span className="nd-of"> з {formatNumber(net.lessons_scheduled)}</span></span></td>
                <td className="r" data-label="Відвідуваність">{net.attendance_rate_pct === null ? "—" : formatPercent(net.attendance_rate_pct)}</td>
                <td className="r" data-label="Нараховано">{formatCurrency(net.payroll_uah)} ₴</td>
                <td data-label="Увага">{net.lessons_unmarked_overdue > 0 ? `${formatNumber(net.lessons_unmarked_overdue)} не відмічено` : "—"}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
