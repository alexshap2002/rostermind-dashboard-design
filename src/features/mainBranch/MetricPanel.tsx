import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatNumber, formatPercent, pluralUk } from "../../lib/format";
import { IconClose } from "../../lib/icons";
import {
  mainBranchQueries, SEVERITY, UNMARKED_LESSON,
  type AttentionReport, type BranchRow, type MainBranchFilters, type MainBranchKpi,
} from "./api";
import { Delta, countLessons, networkTotals, type Panel, type PanelKind } from "./metrics";

const KYIV_WHEN = new Intl.DateTimeFormat("uk-UA", {
  timeZone: "Europe/Kyiv", weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
});

const TITLES: Record<PanelKind, string> = {
  students: "Діти в базі",
  new: "Нові діти за період",
  lessons: "Проведені заняття",
  attendance: "Відвідуваність",
  payroll: "Нараховано зарплат",
  unmarked: "Невідмічені заняття",
  today: "Сьогодні за розкладом",
  attention: "Потребує уваги",
  branch: "Огляд філії",
};

interface Props {
  panel: Panel;
  kpi: MainBranchKpi | undefined;
  todayKpi: MainBranchKpi | undefined;
  attention: AttentionReport | undefined;
  filters: MainBranchFilters;
  nowFilters: MainBranchFilters;
  periodLabel: string;
  nowLabel: string;
  canEnter: boolean;
  busyId: number | null;
  onPanel: (panel: Panel | null) => void;
  /** Перейти у філію й відкрити сторінку: змінює робочий контекст. */
  onWork: (tenantId: number, tenantName: string, path: string, what: string) => void;
}

export function MetricPanel(props: Props) {
  const { panel, onPanel } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Нативний модальний <dialog>: фокус не виходить за панель, Escape закриває, решта сторінки — inert.
  // Після закриття фокус повертається туди, звідки панель відкрили (клітинка таблиці, KPI, сигнал).
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    closeRef.current?.focus();
    // Не викликаємо dialog.close() тут: подія close знову закрила б панель під час подвійного ефекту StrictMode,
    // а вилучення <dialog> зі сторінки й так знімає його з верхнього шару.
    return () => { opener?.focus(); };
  }, []);

  const rowsAll = (panel.kind === "today" ? props.todayKpi : props.kpi)?.branch_rows ?? [];
  const branchName = panel.branch !== null ? rowsAll.find((r) => r.tenant_id === panel.branch)?.tenant_name : undefined;
  const scopeLabel = panel.kind === "today" ? "сьогодні" : panel.scope === "now" ? props.nowLabel : props.periodLabel;

  return (
    <dialog
      ref={dialogRef}
      className="nd-drawer"
      aria-labelledby="nd-drawer-title"
      onClose={() => onPanel(null)}
      // Клік по затемненню (::backdrop) приходить на сам <dialog>, а не на його вміст.
      onClick={(e) => { if (e.target === e.currentTarget) onPanel(null); }}
    >
        <header className="nd-drawer-head">
          <div>
            <div className="nd-eyebrow">{scopeLabel}</div>
            <h3 id="nd-drawer-title">{panel.kind === "branch" ? branchName ?? "Філія" : TITLES[panel.kind]}</h3>
            {panel.branch !== null && panel.kind !== "branch" && (
              <button type="button" className="nd-chip on" onClick={() => onPanel({ ...panel, branch: null })}>
                Лише {branchName} <span aria-hidden="true">✕</span><span className="sr-only">— показати всі філії</span>
              </button>
            )}
          </div>
          <button ref={closeRef} type="button" className="nd-icon-btn" aria-label="Закрити" onClick={() => onPanel(null)}><IconClose /></button>
        </header>
        <div className="nd-drawer-body">
          <PanelBody {...props} rowsAll={rowsAll} branchName={branchName} />
        </div>
    </dialog>
  );
}

function PanelBody(props: Props & { rowsAll: BranchRow[]; branchName: string | undefined }) {
  const { panel, rowsAll, onPanel, onWork, canEnter, busyId } = props;
  const rows = panel.branch !== null ? rowsAll.filter((r) => r.tenant_id === panel.branch) : rowsAll;
  const net = networkTotals(rows);
  const many = rows.length > 1;
  const work = (r: { tenant_id: number; tenant_name: string }, path: string, what: string) =>
    canEnter ? (
      <button type="button" className="nd-go" disabled={busyId !== null} aria-label={`${what}: ${r.tenant_name}`} title={what}
        onClick={() => onWork(r.tenant_id, r.tenant_name, path, what)}>
        {busyId === r.tenant_id ? "Переходимо…" : "У філії →"}
      </button>
    ) : null;
  const scopeQuery = panel.scope === "now" ? props.nowFilters : props.filters;
  const branchFilter = panel.branch !== null ? { ...scopeQuery, branchIds: [panel.branch] } : scopeQuery;

  switch (panel.kind) {
    case "students":
      return (
        <>
          <p className="nd-note">Поточна база дітей на кінець періоду — без відбору за датою додавання. Нові за період — окремо.</p>
          <Table head={["Філія", "Діти в базі", "Нові", ""]}>
            {rows.map((r) => (
              <tr key={r.tenant_id}>
                <th scope="row">{r.tenant_name}</th>
                <td className="r">{formatNumber(r.students_total)}</td>
                <td className="r"><button type="button" className="nd-cell" onClick={() => onPanel({ kind: "new", branch: r.tenant_id, scope: "period" })}>+{formatNumber(r.students_new)}</button></td>
                <td className="r">{work(r, "/students", "Учні філії")}</td>
              </tr>
            ))}
            {many && <Total cells={["Уся мережа", formatNumber(net.students_total), `+${formatNumber(net.students_new)}`, ""]} />}
          </Table>
        </>
      );
    case "new":
      return (
        <>
          <p className="nd-note">Діти, додані в базу за період. Окремих карток тут немає — список відкривається у філії.</p>
          <Table head={["Філія", "Нових за період", ""]}>
            {rows.map((r) => (
              <tr key={r.tenant_id}>
                <th scope="row">{r.tenant_name}</th>
                <td className="r">+{formatNumber(r.students_new)}</td>
                <td className="r">{work(r, "/students", "Нові діти філії")}</td>
              </tr>
            ))}
            {many && <Total cells={["Уся мережа", `+${formatNumber(net.students_new)}`, ""]} />}
          </Table>
          <p className="nd-note muted">У програмі сторінка «Учні» поки не має фільтра «додані за період» — відкриється вся база філії.</p>
        </>
      );
    case "lessons":
      return (
        <>
          <p className="nd-note">Навчальні заняття за період: проведено — відмічені вчителем; не відмічено — минули, але відмітки немає; попереду — сьогоднішні й пізніші.</p>
          <Table head={["Філія", "Проведено", "Заплановано", "Не відмічено", "Попереду", ""]}>
            {rows.map((r) => (
              <tr key={r.tenant_id}>
                <th scope="row">{r.tenant_name}</th>
                <td className="r">{formatNumber(r.lessons_completed)}</td>
                <td className="r">{formatNumber(r.lessons_scheduled)}</td>
                <td className="r">
                  {r.lessons_unmarked_overdue > 0
                    ? <button type="button" className="nd-cell warn" onClick={() => onPanel({ kind: "unmarked", branch: r.tenant_id, scope: "period" })}>{formatNumber(r.lessons_unmarked_overdue)}</button>
                    : "0"}
                </td>
                <td className="r">{formatNumber(r.lessons_upcoming)}</td>
                <td className="r">{work(r, "/conducted-lessons", "Журнал філії")}</td>
              </tr>
            ))}
            {many && <Total cells={["Уся мережа", formatNumber(net.lessons_completed), formatNumber(net.lessons_scheduled), formatNumber(net.lessons_unmarked_overdue), formatNumber(net.lessons_upcoming), ""]} />}
          </Table>
        </>
      );
    case "attendance":
      return (
        <>
          <p className="nd-note">Відвідуваність = присутні / очікувані діти на відмічених заняттях з дітьми. Невідмічені заняття не рахуються пропусками. Підсумок мережі — по всіх дітях, а не середнє відсотків філій.</p>
          <Table head={["Філія", "Очікувано", "Присутні", "Пропуски", "Відвідуваність", ""]}>
            {rows.map((r) => (
              <tr key={r.tenant_id}>
                <th scope="row">{r.tenant_name}</th>
                <td className="r">{formatNumber(r.total_students)}</td>
                <td className="r">{formatNumber(r.present_students)}</td>
                <td className="r">{formatNumber(r.total_students - r.present_students)}</td>
                <td className="r">
                  {r.attendance_rate_pct === null ? <span className="nd-muted">немає занять</span> : (
                    <span className="nd-stack">{formatPercent(r.attendance_rate_pct)}<Delta value={r.attendance_change_pp} unit="pp" /></span>
                  )}
                </td>
                <td className="r">{work(r, "/statistics", "Відвідуваність філії")}</td>
              </tr>
            ))}
            {many && <Total cells={["Уся мережа", formatNumber(net.total_students), formatNumber(net.present_students), formatNumber(net.total_students - net.present_students), net.attendance_rate_pct === null ? "—" : formatPercent(net.attendance_rate_pct), ""]} />}
          </Table>
          <AttentionList items={(props.attention?.items ?? []).filter((it) => it.anomaly_type !== UNMARKED_LESSON && (panel.branch === null || it.tenant_id === panel.branch))} />
        </>
      );
    case "payroll":
      return <PayrollBody filters={branchFilter} rows={rows} work={work} />;
    case "unmarked":
      return <UnmarkedBody filters={branchFilter} onWork={onWork} canEnter={canEnter} busyId={busyId} />;
    case "today":
      return (
        <Table head={["Філія", "За розкладом", "Проведено", "Попереду", "Не відмічено"]}>
          {rows.map((r) => (
            <tr key={r.tenant_id}>
              <th scope="row">{r.tenant_name}</th>
              <td className="r">{formatNumber(r.lessons_scheduled)}</td>
              <td className="r">{formatNumber(r.lessons_completed)}</td>
              <td className="r">{formatNumber(r.lessons_upcoming)}</td>
              <td className="r">{formatNumber(r.lessons_unmarked_overdue)}</td>
            </tr>
          ))}
          {many && <Total cells={["Уся мережа", formatNumber(net.lessons_scheduled), formatNumber(net.lessons_completed), formatNumber(net.lessons_upcoming), formatNumber(net.lessons_unmarked_overdue)]} />}
        </Table>
      );
    case "attention":
      return <AttentionList items={(props.attention?.items ?? []).filter((it) => panel.branch === null || it.tenant_id === panel.branch)} all />;
    case "branch": {
      const r = rows[0];
      if (!r) return <div className="nd-empty">Філію не знайдено у вибраних</div>;
      const open = (kind: PanelKind) => onPanel({ kind, branch: r.tenant_id, scope: "period" });
      return (
        <>
          <p className="nd-note">Огляд у межах аналітики мережі — нічого не перемикає. Щоб відмічати, редагувати й бачити окремих дітей, перейдіть у роботу філії.</p>
          <div className="nd-mini-grid">
            <Mini label="Діти в базі" value={formatNumber(r.students_total)} sub={`+${formatNumber(r.students_new)} нових`} onClick={() => open("students")} />
            <Mini label="Проведено занять" value={formatNumber(r.lessons_completed)} sub={`з ${formatNumber(r.lessons_scheduled)}`} onClick={() => open("lessons")} />
            <Mini label="Відвідуваність" value={r.attendance_rate_pct === null ? "—" : formatPercent(r.attendance_rate_pct)} sub={<Delta value={r.attendance_change_pp} unit="pp" />} onClick={() => open("attendance")} />
            <Mini label="Нараховано" value={`${formatCurrency(r.payroll_uah)} ₴`} sub={`${formatNumber(r.teachers_total)} ${pluralUk(r.teachers_total, "працівник", "працівники", "працівників")}`} onClick={() => open("payroll")} />
          </div>
          {r.lessons_unmarked_overdue > 0 && (
            <button type="button" className="nd-signal warn wide" onClick={() => open("unmarked")}>
              <span className="nd-signal-tag">Увага</span><b>{countLessons(r.lessons_unmarked_overdue)} не відмічено</b><span className="nd-signal-go" aria-hidden="true">→</span>
            </button>
          )}
          <AttentionList items={(props.attention?.items ?? []).filter((it) => it.tenant_id === r.tenant_id && it.anomaly_type !== UNMARKED_LESSON)} />
          {canEnter && (
            <button type="button" className="btn nd-work" disabled={busyId !== null} onClick={() => onWork(r.tenant_id, r.tenant_name, "/", "Працювати у філії")}>
              {busyId === r.tenant_id ? "Переходимо…" : `Працювати у філії ${r.tenant_name}`}
            </button>
          )}
        </>
      );
    }
  }
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="nd-table-scroll">
      <table className="nd-table compact">
        <thead><tr>{head.map((h, i) => <th key={i} className={i ? "r" : undefined}>{h || <span className="sr-only">Дії</span>}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Total({ cells }: { cells: ReactNode[] }) {
  return <tr className="nd-total">{cells.map((c, i) => (i ? <td key={i} className="r">{c}</td> : <th key={i} scope="row">{c}</th>))}</tr>;
}

function Mini({ label, value, sub, onClick }: { label: string; value: string; sub: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="nd-mini" onClick={onClick}>
      <span className="nd-mini-label">{label}</span>
      <span className="nd-mini-value">{value}</span>
      <span className="nd-mini-sub">{sub}</span>
    </button>
  );
}

function AttentionList({ items, all = false }: { items: AttentionReport["items"]; all?: boolean }) {
  if (!items.length) return all ? <div className="nd-empty">Сигналів немає — усе спокійно</div> : null;
  return (
    <div className="nd-att">
      <h4>Сигнали</h4>
      {items.map((it, i) => {
        const sev = SEVERITY[it.severity] ?? SEVERITY.info;
        return (
          <div key={i} className="nd-att-item">
            <span className={`nd-pill ${sev.tone === "delete" ? "risk" : "warn"}`}>{sev.label}</span>
            <div>
              <div className="nd-att-title">{it.summary}</div>
              <div className="nd-att-sub">{[it.tenant_name, it.club_name].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PayrollBody({ filters, rows, work }: {
  filters: MainBranchFilters; rows: BranchRow[];
  work: (r: { tenant_id: number; tenant_name: string }, path: string, what: string) => ReactNode;
}) {
  const [people, setPeople] = useState(false);
  const report = useQuery(mainBranchQueries.teachers(filters));
  const byTenant = new Map<number, { lessons: number; bonus: number }>();
  for (const p of report.data?.payroll_rows ?? []) {
    const cur = byTenant.get(p.tenant_id) ?? { lessons: 0, bonus: 0 };
    byTenant.set(p.tenant_id, { lessons: cur.lessons + Number(p.lessons_amount_uah), bonus: cur.bonus + Number(p.bonus_amount_uah) });
  }
  const tot = [...byTenant.values()].reduce((s, x) => ({ lessons: s.lessons + x.lessons, bonus: s.bonus + x.bonus }), { lessons: 0, bonus: 0 });
  return (
    <>
      <p className="nd-note">Нараховано за період: за проведені заняття й бонуси. Це нарахування, а не виплати — статусу виплати в програмі немає. Оплата RosterMind — окремо, у «Філії й оплата».</p>
      {report.isLoading ? <span className="nd-skel" style={{ width: "100%", height: 120 }} /> : (
        <Table head={["Філія", "За заняття", "Бонуси", "Разом", ""]}>
          {rows.map((r) => {
            const x = byTenant.get(r.tenant_id) ?? { lessons: 0, bonus: 0 };
            return (
              <tr key={r.tenant_id}>
                <th scope="row">{r.tenant_name}</th>
                <td className="r">{formatCurrency(x.lessons)} ₴</td>
                <td className="r">{formatCurrency(x.bonus)} ₴</td>
                <td className="r"><b>{formatCurrency(x.lessons + x.bonus)} ₴</b></td>
                <td className="r">{work(r, "/payroll", "Зарплати філії")}</td>
              </tr>
            );
          })}
          {rows.length > 1 && <Total cells={["Уся мережа", `${formatCurrency(tot.lessons)} ₴`, `${formatCurrency(tot.bonus)} ₴`, `${formatCurrency(tot.lessons + tot.bonus)} ₴`, ""]} />}
        </Table>
      )}
      <button type="button" className="link nd-more" aria-expanded={people} onClick={() => setPeople((v) => !v)}>
        {people ? "Сховати по працівниках" : "Показати по працівниках"}
      </button>
      {people && report.data && (
        <Table head={["Працівник", "Філія", "Занять", "Разом"]}>
          {report.data.payroll_rows.map((p) => (
            <tr key={`${p.tenant_id}-${p.teacher_id}`}>
              <th scope="row">{p.teacher_name}</th>
              <td className="r">{p.tenant_name}</td>
              <td className="r">{formatNumber(p.lessons_paid)}</td>
              <td className="r">{formatCurrency(Number(p.total_uah))} ₴</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

function UnmarkedBody({ filters, onWork, canEnter, busyId }: {
  filters: MainBranchFilters; onWork: Props["onWork"]; canEnter: boolean; busyId: number | null;
}) {
  const q = useQuery(mainBranchQueries.anomalies(filters, 0, 100, { type: UNMARKED_LESSON }));
  const rows = q.data?.rows ?? [];
  if (q.isLoading) return <span className="nd-skel" style={{ width: "100%", height: 120 }} />;
  if (!rows.length) return <div className="nd-empty">Усі заняття відмічені</div>;
  return (
    <>
      <p className="nd-note">Заняття, що вже минули, а відмітки немає. Відмічає вчитель у боті або адміністратор у журналі філії.</p>
      <ul className="nd-list">
        {rows.map((r) => (
          <li key={`${r.tenant_id}-${r.lesson_id}`}>
            <div>
              <b>{r.club_name ?? "Заняття"}</b>
              <span>{r.lesson_date ? KYIV_WHEN.format(new Date(r.lesson_date)) : r.details_json?.lesson_day}</span>
              <span>{[r.details_json?.teacher_name ? `вч. ${r.details_json.teacher_name}` : null, r.tenant_name].filter(Boolean).join(" · ")}</span>
            </div>
            {canEnter && (
              <button type="button" className="nd-go" disabled={busyId !== null} onClick={() => onWork(r.tenant_id, r.tenant_name, "/conducted-lessons", "Відмітити у філії")}>
                Відмітити у філії →
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
