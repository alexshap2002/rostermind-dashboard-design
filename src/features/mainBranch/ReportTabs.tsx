import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { StatusTag } from "../../components/admin/primitives";
import { ApiError } from "../../lib/api";
import { formatCurrency, formatDateUk, formatNumber, formatPercent, formatPp } from "../../lib/format";
import {
  ANOMALY_LABELS, SEVERITY, mainBranchQueries,
  type AnomalyFilter, type AnomalyRow, type ChronicRow, type ClubRow, type LessonsRow, type MainBranchFilters, type PayrollRow,
} from "./api";
import { SortTh, useSort } from "./sort";

export type Tab = "lessons" | "clubs" | "attendance" | "payroll" | "problems";

export const TABS: { key: Tab; label: string; dataset: string }[] = [
  { key: "lessons", label: "Уроки", dataset: "lessons" },
  { key: "clubs", label: "Гуртки", dataset: "lessons" },
  { key: "attendance", label: "Відвідуваність", dataset: "attendance" },
  { key: "payroll", label: "Зарплати", dataset: "teachers" },
  { key: "problems", label: "Проблеми", dataset: "anomalies" },
];

const PAGE = 50;
const num = (v: number | null | undefined) => formatNumber(Number(v ?? 0));
const money = (v: number | null | undefined) => `${formatCurrency(Number(v ?? 0))} ₴`;

interface Props {
  tab: Tab;
  tabs: typeof TABS;
  onTab: (tab: Tab) => void;
  filters: MainBranchFilters;
  /** Філія з «Потребує уваги»: «Гуртки» й «Відвідуваність» показують лише її і за те саме вікно,
      що й проблема (window, 30 днів), — фільтри сторінки й Excel не чіпаємо. */
  tenant: { id: number; name: string; window: MainBranchFilters; windowLabel: string } | null;
  onClearTenant: () => void;
  problemFilter: AnomalyFilter & { cursor: number };
  onProblemFilter: (next: AnomalyFilter & { cursor: number }) => void;
  canEnter: boolean;
  busyId: number | null;
  onAction: (row: AnomalyRow) => void;
}

export function ReportTabs({ tab, tabs, onTab, filters, tenant, onClearTenant, problemFilter, onProblemFilter, canEnter, busyId, onAction }: Props) {
  const scoped = tenant !== null && (tab === "clubs" || tab === "attendance");
  const lessons = useQuery({ ...mainBranchQueries.lessons(scoped ? tenant.window : filters), enabled: tab === "lessons" || tab === "clubs" });
  const attendance = useQuery({ ...mainBranchQueries.attendance(scoped ? tenant.window : filters), enabled: tab === "attendance" });
  const teachers = useQuery({ ...mainBranchQueries.teachers(filters), enabled: tab === "payroll" });
  const problems = useQuery({
    ...mainBranchQueries.anomalies(filters, problemFilter.cursor, PAGE, { severity: problemFilter.severity, type: problemFilter.type }),
    enabled: tab === "problems",
  });
  const active = { lessons, clubs: lessons, attendance, payroll: teachers, problems }[tab];
  const error = active.error instanceof ApiError ? active.error : null;
  const onlyTenant = <T extends { tenant_id: number }>(rows: T[]) => (scoped ? rows.filter((r) => r.tenant_id === tenant.id) : rows);

  return (
    <section className="nw-tabs">
      <div className="nw-tabs-head">
        <div className="seg" role="tablist" aria-label="Деталі по мережі">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => onTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        {scoped && (
          <button type="button" className="mb-chip on" onClick={onClearTenant}>Лише: {tenant.name} · {tenant.windowLabel} ✕</button>
        )}
      </div>

      <div className="table-card">
        {active.isLoading && <div className="empty-inline" style={{ padding: 24 }}>Завантажуємо…</div>}
        {error && (
          <div className="form-error" style={{ margin: 14 }}>
            Не вдалося завантажити: {error.message}{" "}
            <button type="button" className="btn ghost sm" onClick={() => active.refetch()}>Спробувати ще</button>
          </div>
        )}
        {!active.isLoading && !error && (
          <>
            {tab === "lessons" && lessons.data && <LessonsTable rows={lessons.data.rows} totals={lessons.data.totals} />}
            {tab === "clubs" && lessons.data && <ClubsTable rows={onlyTenant(lessons.data.club_rows)} />}
            {tab === "attendance" && attendance.data && (
              <>
                <AttendanceTable rows={onlyTenant(attendance.data.rows)} totals={scoped ? null : attendance.data.totals} />
                <Reveal label={`Діти, які часто пропускають (${num(onlyTenant(attendance.data.chronic_rows).length)})`}>
                  <ChronicTable rows={onlyTenant(attendance.data.chronic_rows)} />
                </Reveal>
              </>
            )}
            {tab === "payroll" && teachers.data && (
              <>
                <PayrollByBranch rows={teachers.data.payroll_rows} />
                <Reveal label={`По працівниках (${num(teachers.data.payroll_rows.length)})`}>
                  <PayrollTable rows={teachers.data.payroll_rows} totals={teachers.data.payroll_totals} />
                </Reveal>
              </>
            )}
            {tab === "problems" && (
              <ProblemsTable
                data={problems.data}
                fetching={problems.isFetching}
                filter={problemFilter}
                onFilter={onProblemFilter}
                canEnter={canEnter}
                busyId={busyId}
                onAction={onAction}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

function LessonsTable({ rows, totals }: { rows: LessonsRow[]; totals: Record<string, number | null> }) {
  const sort = useSort(rows, "tenant_name", "asc");
  return (
    <div className="table-scroll">
      <table className="dtable nw-table">
        <thead>
          <tr>
            <SortTh sort={sort} field="tenant_name" defaultDir="asc">Філія</SortTh>
            <SortTh sort={sort} field="lessons_total" className="col-center">Заплановано</SortTh>
            <SortTh sort={sort} field="completed" className="col-center">Проведено</SortTh>
            <SortTh sort={sort} field="skipped" className="col-center">Пропущено</SortTh>
            <SortTh sort={sort} field="cancelled" className="col-center">Скасовано</SortTh>
            <SortTh sort={sort} field="unmarked_overdue" className="col-center">Не відмічено</SortTh>
            <SortTh sort={sort} field="upcoming" className="col-center">Ще попереду</SortTh>
            <SortTh sort={sort} field="attendance_rate_pct" className="col-center">Відвідуваність</SortTh>
          </tr>
        </thead>
        <tbody>
          {sort.sorted.map((r) => (
            <tr key={r.tenant_id}>
              <td data-label="Філія"><div className="cell-name">{r.tenant_name}</div></td>
              <td className="col-center tnum" data-label="Заплановано">{num(r.lessons_total)}</td>
              <td className="col-center tnum" data-label="Проведено">{num(r.completed)}</td>
              <td className="col-center tnum" data-label="Пропущено">{num(r.skipped)}</td>
              <td className="col-center tnum" data-label="Скасовано">{num(r.cancelled)}</td>
              <td className={`col-center tnum${r.unmarked_overdue > 0 ? " nw-warn" : ""}`} data-label="Не відмічено">{num(r.unmarked_overdue)}</td>
              <td className="col-center tnum" data-label="Ще попереду">{num(r.upcoming)}</td>
              <td className="col-center tnum" data-label="Відвідуваність">{formatPercent(r.attendance_rate_pct)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Разом</td>
            <td className="col-center tnum">{num(totals.lessons_total)}</td>
            <td className="col-center tnum">{num(totals.completed)}</td>
            <td className="col-center tnum">{num(totals.skipped)}</td>
            <td className="col-center tnum">{num(totals.cancelled)}</td>
            <td className="col-center tnum">{num(totals.unmarked_overdue)}</td>
            <td className="col-center tnum">{num(totals.upcoming)}</td>
            <td className="col-center tnum">{formatPercent(totals.attendance_rate_pct)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ClubsTable({ rows }: { rows: ClubRow[] }) {
  // За замовчуванням — найбільше падіння зверху: так видно, чому філія гірша.
  const sort = useSort(rows, "attendance_change_pp", "asc");
  if (rows.length === 0) return <div className="empty-inline" style={{ padding: 24 }}>За період уроків у гуртках не було</div>;
  return (
    <div className="table-scroll">
      <table className="dtable nw-table">
        <thead>
          <tr>
            <SortTh sort={sort} field="club_name" defaultDir="asc">Гурток</SortTh>
            <SortTh sort={sort} field="tenant_name" defaultDir="asc">Філія</SortTh>
            <SortTh sort={sort} field="teacher_names" defaultDir="asc">Вчитель</SortTh>
            <SortTh sort={sort} field="lessons_completed" className="col-center">Уроки</SortTh>
            <SortTh sort={sort} field="lessons_unmarked_overdue" className="col-center">Не відмічено</SortTh>
            <SortTh sort={sort} field="attendance_rate_pct" className="col-center">Відвідуваність</SortTh>
            <SortTh sort={sort} field="attendance_change_pp" className="col-center" defaultDir="asc">Зміна</SortTh>
          </tr>
        </thead>
        <tbody>
          {sort.sorted.map((r) => (
            <tr key={`${r.tenant_id}-${r.club_id}`}>
              <td data-label="Гурток"><div className="cell-name">{r.club_name}</div></td>
              <td data-label="Філія">{r.tenant_name}</td>
              <td data-label="Вчитель">{r.teacher_names}</td>
              <td className="col-center tnum" data-label="Уроки">{num(r.lessons_completed)} <span className="nw-sub">з {num(r.lessons_scheduled)}</span></td>
              <td className={`col-center tnum${r.lessons_unmarked_overdue > 0 ? " nw-warn" : ""}`} data-label="Не відмічено">{num(r.lessons_unmarked_overdue)}</td>
              <td className="col-center tnum" data-label="Відвідуваність">{formatPercent(r.attendance_rate_pct)}</td>
              <td className={`col-center tnum ${r.attendance_change_pp === null ? "" : r.attendance_change_pp < 0 ? "down" : "up"}`} data-label="Зміна">
                {formatPp(r.attendance_change_pp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceTable({ rows, totals }: { rows: Array<{ tenant_id: number; tenant_name: string; expected_students: number; present_students: number; absent_students: number; attendance_rate_pct: number | null; chronic_absence_students_count: number }>; totals: Record<string, number | null> | null }) {
  const sort = useSort(rows, "tenant_name", "asc");
  return (
    <div className="table-scroll">
      <table className="dtable nw-table">
        <thead>
          <tr>
            <SortTh sort={sort} field="tenant_name" defaultDir="asc">Філія</SortTh>
            <SortTh sort={sort} field="expected_students" className="col-center">Мали прийти</SortTh>
            <SortTh sort={sort} field="present_students" className="col-center">Присутні</SortTh>
            <SortTh sort={sort} field="absent_students" className="col-center">Відсутні</SortTh>
            <SortTh sort={sort} field="attendance_rate_pct" className="col-center">Відвідуваність</SortTh>
            <SortTh sort={sort} field="chronic_absence_students_count" className="col-center">Часто пропускають</SortTh>
          </tr>
        </thead>
        <tbody>
          {sort.sorted.map((r) => (
            <tr key={r.tenant_id}>
              <td data-label="Філія"><div className="cell-name">{r.tenant_name}</div></td>
              <td className="col-center tnum" data-label="Мали прийти">{num(r.expected_students)}</td>
              <td className="col-center tnum" data-label="Присутні">{num(r.present_students)}</td>
              <td className="col-center tnum" data-label="Відсутні">{num(r.absent_students)}</td>
              <td className="col-center tnum" data-label="Відвідуваність">{formatPercent(r.attendance_rate_pct)}</td>
              <td className={`col-center tnum${r.chronic_absence_students_count > 0 ? " nw-warn" : ""}`} data-label="Часто пропускають">{num(r.chronic_absence_students_count)}</td>
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              <td>Разом</td>
              <td className="col-center tnum">{num(totals.expected_students)}</td>
              <td className="col-center tnum">{num(totals.present_students)}</td>
              <td className="col-center tnum">{num(totals.absent_students)}</td>
              <td className="col-center tnum">{formatPercent(totals.attendance_rate_pct)}</td>
              <td className="col-center tnum">{num(totals.chronic_absence_students_count)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

const CHRONIC_SHOWN = 20;

function ChronicTable({ rows }: { rows: ChronicRow[] }) {
  // Зверху — хто пропустив найбільше уроків: 4 з 9 важить більше, ніж 1 з 2.
  const sort = useSort(rows, "absences", "desc");
  const [all, setAll] = useState(false);
  const visible = all ? sort.sorted : sort.sorted.slice(0, CHRONIC_SHOWN);
  return (
    <div className="nw-sub-block">
      <h4>Діти, що часто пропускають</h4>
      <p className="nw-hint">Щонайменше 3 пропуски й від 20 % уроків за період. Зверху — ті, хто пропустив найбільше.</p>
      {rows.length === 0 ? (
        <div className="empty-inline">Таких дітей за період немає</div>
      ) : (
        <div className="table-scroll">
          <table className="dtable nw-table">
            <thead>
              <tr>
                <SortTh sort={sort} field="student_name" defaultDir="asc">Дитина</SortTh>
                <SortTh sort={sort} field="tenant_name" defaultDir="asc">Філія</SortTh>
                <SortTh sort={sort} field="lessons" className="col-center">Уроків</SortTh>
                <SortTh sort={sort} field="absences" className="col-center">Пропусків</SortTh>
                <SortTh sort={sort} field="absence_pct" className="col-center">Пропущено</SortTh>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={`${r.tenant_id}-${r.student_id}`}>
                  <td data-label="Дитина"><div className="cell-name">{r.student_name}</div></td>
                  <td data-label="Філія">{r.tenant_name}</td>
                  <td className="col-center tnum" data-label="Уроків">{num(r.lessons)}</td>
                  <td className="col-center tnum" data-label="Пропусків">{num(r.absences)}</td>
                  <td className="col-center tnum nw-warn" data-label="Пропущено">{formatPercent(r.absence_pct, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!all && rows.length > CHRONIC_SHOWN && (
            <button type="button" className="nw-more" onClick={() => setAll(true)}>Показати всіх ({formatNumber(rows.length)})</button>
          )}
        </div>
      )}
    </div>
  );
}

function PayrollTable({ rows, totals }: { rows: PayrollRow[]; totals: { lessons_amount_uah: number; bonus_amount_uah: number; total_uah: number } }) {
  const sort = useSort(rows, "tenant_name", "asc");
  if (rows.length === 0) return <div className="empty-inline" style={{ padding: 24 }}>За період зарплат не нараховано</div>;
  return (
    <div className="table-scroll">
      <table className="dtable nw-table">
        <thead>
          <tr>
            <SortTh sort={sort} field="tenant_name" defaultDir="asc">Філія</SortTh>
            <SortTh sort={sort} field="teacher_name" defaultDir="asc">Вчитель</SortTh>
            <SortTh sort={sort} field="lessons_paid" className="col-center">Уроків</SortTh>
            <SortTh sort={sort} field="lessons_amount_uah" className="col-center">За уроки</SortTh>
            <SortTh sort={sort} field="bonus_amount_uah" className="col-center">Бонуси</SortTh>
            <SortTh sort={sort} field="total_uah" className="col-center">Разом</SortTh>
          </tr>
        </thead>
        <tbody>
          {sort.sorted.map((r) => (
            <tr key={`${r.tenant_id}-${r.teacher_id}`}>
              <td data-label="Філія">{r.tenant_name}</td>
              <td data-label="Вчитель"><div className="cell-name">{r.teacher_name}</div></td>
              <td className="col-center tnum" data-label="Уроків">{num(r.lessons_paid)}</td>
              <td className="col-center tnum" data-label="За уроки">{money(r.lessons_amount_uah)}</td>
              <td className="col-center tnum" data-label="Бонуси">{money(r.bonus_amount_uah)}</td>
              <td className="col-center tnum" data-label="Разом"><b>{money(r.total_uah)}</b></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Разом</td>
            <td />
            <td className="col-center tnum">{num(rows.reduce((s, r) => s + r.lessons_paid, 0))}</td>
            <td className="col-center tnum">{money(totals.lessons_amount_uah)}</td>
            <td className="col-center tnum">{money(totals.bonus_amount_uah)}</td>
            <td className="col-center tnum">{money(totals.total_uah)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const SEVERITY_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Усі" },
  { key: "critical", label: "Терміново" },
  { key: "high", label: "Важливо" },
  { key: "warning", label: "Перевірити" },
];

function ProblemsTable({
  data, fetching, filter, onFilter, canEnter, busyId, onAction,
}: {
  data: import("./api").AnomalyPage | undefined;
  fetching: boolean;
  filter: AnomalyFilter & { cursor: number };
  onFilter: (next: AnomalyFilter & { cursor: number }) => void;
  canEnter: boolean;
  busyId: number | null;
  onAction: (row: AnomalyRow) => void;
}) {
  const rows = data?.rows ?? [];
  return (
    <>
      <div className="toolbar nw-problem-filters">
        <div className="seg">
          {SEVERITY_FILTERS.map((s) => (
            <button key={s.key} className={(filter.severity ?? "") === s.key ? "on" : ""} onClick={() => onFilter({ ...filter, severity: s.key || undefined, cursor: 0 })}>
              {s.label}
            </button>
          ))}
        </div>
        <select
          className="tselect"
          aria-label="Тип проблеми"
          value={filter.type ?? ""}
          onChange={(e) => onFilter({ ...filter, type: e.target.value || undefined, cursor: 0 })}
        >
          <option value="">Усі типи</option>
          {Object.entries(ANOMALY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <div className="table-scroll">
        <table className="dtable nw-table">
          <thead>
            <tr><th>Дата</th><th>Філія</th><th>Гурток</th><th>Що сталося</th><th className="col-center">Рівень</th><th aria-label="Дії" /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6}><div className="empty-inline">Проблем за цими фільтрами немає</div></td></tr>}
            {rows.map((r, i) => (
              <tr key={`${r.anomaly_type}-${r.tenant_id}-${r.lesson_id}-${i}`}>
                <td className="tnum" data-label="Дата">{r.lesson_date ? formatDateUk(r.lesson_date) : "—"}</td>
                <td data-label="Філія">{r.tenant_name}</td>
                <td data-label="Гурток">{r.club_name ?? "—"}</td>
                <td data-label="Що сталося">
                  <div className="cell-name">{ANOMALY_LABELS[r.anomaly_type] ?? r.anomaly_type}</div>
                  <div className="cell-sub">{r.summary_text}</div>
                </td>
                <td className="col-center" data-label="Рівень">
                  <StatusTag tone={(SEVERITY[r.severity] ?? SEVERITY.info).tone}>{(SEVERITY[r.severity] ?? SEVERITY.info).label}</StatusTag>
                </td>
                <td className="nw-act">
                  {canEnter && r.action_url && (
                    <button type="button" className="btn ghost sm" disabled={busyId !== null} onClick={() => onAction(r)}>
                      {r.action_label ?? "Відкрити"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.page.total > data.page.limit && (
        <div className="pager" style={{ padding: 14 }}>
          <button disabled={filter.cursor === 0 || fetching} onClick={() => onFilter({ ...filter, cursor: Math.max(0, filter.cursor - data.page.limit) })}>← Попередні</button>
          <span className="cell-sub">{filter.cursor + 1}–{filter.cursor + data.page.returned} із {data.page.total}</span>
          <button disabled={data.page.next_cursor == null || fetching} onClick={() => onFilter({ ...filter, cursor: data.page.next_cursor ?? filter.cursor })}>Наступні →</button>
        </div>
      )}
    </>
  );
}

/** Персональні списки на рівні мережі — лише за явним кліком; за замовчуванням зведення по філіях. */
function Reveal({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="nd-reveal">
      <button type="button" className="link nd-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? `Сховати: ${label}` : `Показати: ${label}`}
      </button>
      {open && children}
    </div>
  );
}

function PayrollByBranch({ rows }: { rows: PayrollRow[] }) {
  const by = new Map<number, { name: string; lessons: number; bonus: number; people: number }>();
  for (const r of rows) {
    const cur = by.get(r.tenant_id) ?? { name: r.tenant_name, lessons: 0, bonus: 0, people: 0 };
    by.set(r.tenant_id, { name: cur.name, lessons: cur.lessons + Number(r.lessons_amount_uah), bonus: cur.bonus + Number(r.bonus_amount_uah), people: cur.people + 1 });
  }
  const list = [...by.values()].sort((a, b) => a.name.localeCompare(b.name, "uk"));
  if (!list.length) return <div className="empty-inline" style={{ padding: 24 }}>За період зарплат не нараховано</div>;
  const sum = list.reduce((s, x) => ({ lessons: s.lessons + x.lessons, bonus: s.bonus + x.bonus }), { lessons: 0, bonus: 0 });
  return (
    <div className="table-scroll">
      <table className="dtable nw-table">
        <thead><tr><th>Філія</th><th className="col-center">Працівників</th><th className="col-center">За заняття</th><th className="col-center">Бонуси</th><th className="col-center">Разом</th></tr></thead>
        <tbody>
          {list.map((x) => (
            <tr key={x.name}>
              <td data-label="Філія"><div className="cell-name">{x.name}</div></td>
              <td className="col-center tnum" data-label="Працівників">{num(x.people)}</td>
              <td className="col-center tnum" data-label="За заняття">{money(x.lessons)}</td>
              <td className="col-center tnum" data-label="Бонуси">{money(x.bonus)}</td>
              <td className="col-center tnum" data-label="Разом"><b>{money(x.lessons + x.bonus)}</b></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td>Уся мережа</td><td /><td className="col-center tnum">{money(sum.lessons)}</td><td className="col-center tnum">{money(sum.bonus)}</td><td className="col-center tnum"><b>{money(sum.lessons + sum.bonus)}</b></td></tr></tfoot>
      </table>
    </div>
  );
}
