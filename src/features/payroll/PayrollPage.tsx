import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { formatCurrency, formatDateUk, formatNumber } from "../../lib/format";
import { IconClose, IconDownload, IconPencil, IconPlus, IconSearch, IconTrash } from "../../lib/icons";
import { TopNav } from "../../components/layout/TopNav";
import { ExportLink, useCanManage } from "../../components/admin/primitives";
import { useScrollShades } from "../../components/admin/useScrollShades";
import { dashboardQueries } from "../dashboard/api";
import { teachersQueries } from "../teachers/api";
import { clubsQueries } from "../clubs/api";
import {
  payrollApi, payrollExportUrl, payrollQueries,
  type PayrollFilters, type PayrollRecord,
} from "./api";

const IconCalc = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v4" /></svg>
);

const pad2 = (n: number) => String(n).padStart(2, "0");
function currentMonthBounds() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    from: `${y}-${pad2(m + 1)}-01`,
    to: `${y}-${pad2(m + 1)}-${pad2(new Date(y, m + 1, 0).getDate())}`,
  };
}

/** Калькулятор зарплати за період — звіт (як legacy «Розрахувати зарплату»). */
function CalcModal({ onClose }: { onClose: () => void }) {
  const teachers = useQuery(teachersQueries.list());
  const clubs = useQuery(clubsQueries.list());
  const bounds = currentMonthBounds();
  const [dateFrom, setDateFrom] = useState(bounds.from);
  const [dateTo, setDateTo] = useState(bounds.to);
  const [teacherId, setTeacherId] = useState("");
  const [clubName, setClubName] = useState("");
  const [basis, setBasis] = useState("");
  const [applied, setApplied] = useState<PayrollFilters | null>(null);
  const [appliedClub, setAppliedClub] = useState("");

  const report = useQuery({
    ...payrollQueries.list(applied ?? {}),
    enabled: applied != null,
  });

  const rows = useMemo(() => {
    const list = report.data ?? [];
    return appliedClub ? list.filter((r) => r.club_name === appliedClub) : list;
  }, [report.data, appliedClub]);

  const summary = useMemo(() => {
    const total = rows.reduce((s, r) => s + Number(r.amount_decimal || 0), 0);
    const auto = rows.filter((r) => r.basis === "AUTO");
    const manual = rows.filter((r) => r.basis === "MANUAL");
    const byTeacher = new Map<string, { count: number; sum: number }>();
    for (const r of rows) {
      const key = r.teacher_name ?? "—";
      const cur = byTeacher.get(key) ?? { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += Number(r.amount_decimal || 0);
      byTeacher.set(key, cur);
    }
    return {
      total,
      count: rows.length,
      autoCount: auto.length,
      autoSum: auto.reduce((s, r) => s + Number(r.amount_decimal || 0), 0),
      manualCount: manual.length,
      manualSum: manual.reduce((s, r) => s + Number(r.amount_decimal || 0), 0),
      byTeacher: [...byTeacher.entries()].sort((a, b) => b[1].sum - a[1].sum),
    };
  }, [rows]);

  function run() {
    setAppliedClub(clubName);
    setApplied({ teacherId, basis, dateFrom, dateTo, limit: 5000 });
  }
  function reset() {
    setDateFrom(bounds.from);
    setDateTo(bounds.to);
    setTeacherId("");
    setClubName("");
    setBasis("");
    setApplied(null);
    setAppliedClub("");
  }

  const exportUrl = payrollExportUrl({ teacherId, dateFrom, dateTo });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 920 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Розрахунок зарплати за період</h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          <div className="cell-sub" style={{ marginBottom: 14 }}>
            Оберіть період і фільтри — система підсумує вже нараховані зарплати (за уроки й ручні бонуси)
            і покаже підсумок по кожному вчителю. Це звіт: нічого не змінюється.
          </div>
          <div className="fgrid">
            <div className="field span-3">
              <label htmlFor="c-from">Період з *</label>
              <input id="c-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="field span-3">
              <label htmlFor="c-to">по *</label>
              <input id="c-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="field span-6">
              <label htmlFor="c-teacher">Вчитель</label>
              <select id="c-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Усі вчителі</option>
                {(teachers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div className="field span-6">
              <label htmlFor="c-club">Гурток</label>
              <select id="c-club" value={clubName} onChange={(e) => setClubName(e.target.value)}>
                <option value="">Усі гуртки</option>
                {(clubs.data ?? []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="field span-6">
              <label htmlFor="c-basis">Підстава</label>
              <select id="c-basis" value={basis} onChange={(e) => setBasis(e.target.value)}>
                <option value="">Усі</option>
                <option value="AUTO">Авто (за уроки)</option>
                <option value="MANUAL">Ручні / бонуси</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button type="button" className="btn" disabled={report.isFetching} onClick={run}>
              {report.isFetching ? "Рахуємо…" : "Розрахувати"}
            </button>
            {applied && <button type="button" className="btn secondary" onClick={reset}>Скинути</button>}
          </div>

          {applied && !report.isFetching && (
            <>
              <div className="metric-strip" style={{ marginTop: 18 }}>
                <div><b>{formatCurrency(summary.total)} грн</b><span>усього за період</span></div>
                <div><b>{formatNumber(summary.count)}</b><span>нарахувань</span></div>
                <div><b>{formatCurrency(summary.autoSum)} грн</b><span>за уроки ({formatNumber(summary.autoCount)})</span></div>
                <div><b>{formatCurrency(summary.manualSum)} грн</b><span>бонуси ({formatNumber(summary.manualCount)})</span></div>
              </div>

              {summary.count === 0 ? (
                <div className="empty-inline">За цей період нарахувань немає</div>
              ) : (
                <>
                  <div className="fsection between">
                    <span>До виплати по вчителях</span>
                    <ExportLink href={exportUrl} disabled={rows.length === 0} />
                  </div>
                  <div className="calc-teachers">
                    {summary.byTeacher.map(([name, v], i) => (
                      <div className="calc-teacher" key={name}>
                        <span className="calc-rank">{i + 1}</span>
                        <span className="calc-tname">{name}</span>
                        <span className="calc-tmeta">{formatNumber(v.count)} нарах.</span>
                        <b className="calc-tsum">{formatCurrency(v.sum)} грн</b>
                      </div>
                    ))}
                  </div>

                  <div className="fsection">Деталізація ({formatNumber(rows.length)})</div>
                  <div className="table-scroll" style={{ maxHeight: 300, overflowY: "auto" }}>
                    <table className="dtable" style={{ minWidth: 640 }}>
                      <thead>
                        <tr>
                          <th>Дата</th><th>Вчитель</th><th>Гурток / урок</th><th>Підстава</th><th>Сума</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id}>
                            <td className="tnum-cell">{formatDateUk((r.lesson_date ?? r.created_at).slice(0, 10))}</td>
                            <td>{r.teacher_name}</td>
                            <td>{r.club_name ?? "Ручне нарахування"}</td>
                            <td><span className={`tag ${r.basis === "AUTO" ? "update" : "enroll"}`}>{r.basis === "AUTO" ? "за урок" : "бонус"}</span></td>
                            <td className="tnum-cell"><b>{formatCurrency(Number(r.amount_decimal))} грн</b></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}

function PayrollForm({ record, onClose }: { record: PayrollRecord | null; onClose: () => void }) {
  const qc = useQueryClient();
  const teachers = useQuery(teachersQueries.list());
  const [teacherId, setTeacherId] = useState(record ? String(record.teacher_id) : "");
  const [amount, setAmount] = useState(record ? String(Number(record.amount_decimal)) : "");
  const [accrualDate, setAccrualDate] = useState(
    record?.created_at ? record.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState(record?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        teacher_id: Number(teacherId),
        accrual_date: accrualDate || null,
        basis: "MANUAL" as const,
        amount_decimal: Number(amount),
        note: note.trim() || null,
      };
      return record ? payrollApi.update(record.id, payload) : payrollApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Не вдалося зберегти нарахування"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!teacherId) return setError("Оберіть вчителя");
    if (!amount || Number(amount) <= 0) return setError("Вкажіть додатню суму");
    save.mutate();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card narrow" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="modal-head">
          <h3>{record ? "Редагувати нарахування" : "Додати ручне нарахування"}</h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}
          <div className="cell-sub" style={{ marginBottom: 12 }}>
            Вручну додаються лише бонуси й доплати. Зарплата за проведені уроки нараховується
            автоматично — її редагують на сторінці «Проведені уроки».
          </div>
          <div className="fgrid">
            <div className="field span-12">
              <label htmlFor="payroll-teacher">Вчитель *</label>
              <select id="payroll-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Оберіть вчителя…</option>
                {(teachers.data ?? [])
                  .filter((t) => t.active || String(t.id) === teacherId)
                  .map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div className="field span-6">
              <label htmlFor="payroll-amount">Сума, грн *</label>
              <input id="payroll-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field span-6">
              <label htmlFor="payroll-date">Дата нарахування</label>
              <input id="payroll-date" type="date" value={accrualDate} onChange={(e) => setAccrualDate(e.target.value)} />
            </div>
            <div className="field span-12">
              <label htmlFor="payroll-note">Коментар</label>
              <textarea id="payroll-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="За що бонус" />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="btn" disabled={save.isPending}>
            {save.isPending ? "Зберігаємо…" : record ? "Зберегти зміни" : "Додати нарахування"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function PayrollPage() {
  const canManage = useCanManage();
  const qc = useQueryClient();
  const summary = useQuery(dashboardQueries.summary());
  const teachers = useQuery({ ...teachersQueries.list(), enabled: canManage });
  const [search, setSearch] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [clubFilter, setClubFilter] = useState("");
  const [basis, setBasis] = useState("");
  const [dateFrom, setDateFrom] = useState(currentMonthBounds().from);
  const [dateTo, setDateTo] = useState(currentMonthBounds().to);
  const [editing, setEditing] = useState<PayrollRecord | null | "new">(null);
  const [deleting, setDeleting] = useState<PayrollRecord | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const scrollRef = useScrollShades<HTMLDivElement>();
  const filters: PayrollFilters = { teacherId, basis, dateFrom, dateTo };
  const payroll = useQuery(payrollQueries.list(filters));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (payroll.data ?? []).filter((row) => {
      if (clubFilter && row.club_name !== clubFilter) return false;
      if (q && ![row.teacher_name, row.club_name, row.note, row.basis].filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))) return false;
      return true;
    });
  }, [payroll.data, search, clubFilter]);

  const total = filtered.reduce((sum, row) => sum + Number(row.amount_decimal || 0), 0);
  const manualCount = filtered.filter((row) => row.basis === "MANUAL").length;
  const hasFilters = search || teacherId || clubFilter || basis || dateFrom || dateTo;

  // Клуби, які трапляються в нарахуваннях (для фільтра)
  const clubNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of payroll.data ?? []) if (r.club_name) set.add(r.club_name);
    return [...set].sort((a, b) => a.localeCompare(b, "uk"));
  }, [payroll.data]);

  // Розбивка «По працівниках» за видимий період
  const byTeacher = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of filtered) {
      const name = row.teacher_name ?? "—";
      map.set(name, (map.get(name) ?? 0) + Number(row.amount_decimal || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const s = summary.data;
  const counts = s
    ? { students: s.stats.students, teachers: s.stats.teachers, clubs: s.stats.clubs, active_schedules: s.stats.active_schedules }
    : {};

  const remove = useMutation({
    mutationFn: (id: number) => payrollApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleting(null);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Не вдалося видалити нарахування"),
  });

  if (summary.error instanceof ApiError && summary.error.status === 401) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <TopNav counts={counts} user={s?.user} tenantName={s?.tenant.name} />

      <div className="content wide">
        <div className="page-head">
          <div>
            <h2>Зарплати</h2>
            <p>
              {payroll.data
                ? `${formatNumber(filtered.length)} нарахувань · ${formatCurrency(total)} грн у видимому списку`
                : "Завантаження…"}
            </p>
          </div>
        </div>

        {actionError && (
          <div className="form-error" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>{actionError}</span>
            <button className="link" onClick={() => setActionError(null)}>Закрити</button>
          </div>
        )}

        <div className="toolbar">
          <div className="tsearch">
            <IconSearch />
            <input placeholder="Пошук: вчитель, гурток, коментар…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {canManage && (
            <select className="tselect" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Вчитель: всі</option>
              {(teachers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          )}
          <select className="tselect" value={clubFilter} onChange={(e) => setClubFilter(e.target.value)}>
            <option value="">Гурток: всі</option>
            {clubNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select className="tselect" value={basis} onChange={(e) => setBasis(e.target.value)}>
            <option value="">Підстава: всі</option>
            <option value="AUTO">Авто (за уроки)</option>
            <option value="MANUAL">Ручні / бонуси</option>
          </select>
          <label className="tsel-date"><span>з</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
          <label className="tsel-date"><span>по</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
          {hasFilters && (
            <button className="btn ghost" onClick={() => { setSearch(""); setTeacherId(""); setClubFilter(""); setBasis(""); setDateFrom(""); setDateTo(""); }}>Скинути</button>
          )}
          <span className="spacer" />
          {canManage && (
            <button className="btn ghost" onClick={() => setCalcOpen(true)}><IconCalc />Розрахувати зарплату</button>
          )}
          <a className="btn ghost" href={payrollExportUrl(filters)}><IconDownload />Експорт</a>
          {canManage && (
            <button className="btn" onClick={() => setEditing("new")}><IconPlus /><span>Додати бонус</span></button>
          )}
        </div>

        <div className="metric-strip">
          <div><b>{formatCurrency(total)} грн</b><span>видимі нарахування</span></div>
          <div><b>{formatNumber(filtered.length - manualCount)}</b><span>авто за уроки</span></div>
          <div><b>{formatNumber(manualCount)}</b><span>ручні / бонуси</span></div>
          {byTeacher.slice(0, 3).map(([name, sum]) => (
            <div key={name}><b>{formatCurrency(sum)} грн</b><span>{name}</span></div>
          ))}
          {byTeacher.length > 3 && <div><b>+{byTeacher.length - 3}</b><span>інших вчителів</span></div>}
        </div>

        <div className="table-card">
          <div className="table-scroll" ref={scrollRef}>
            <table className="dtable" style={{ minWidth: 1040 }}>
              <thead>
                <tr>
                  <th className="sticky-l" style={{ minWidth: 110 }}>Дата</th>
                  <th style={{ minWidth: 170 }}>Вчитель</th>
                  <th style={{ minWidth: 180 }}>Гурток / урок</th>
                  <th>Підстава</th>
                  <th>Сума</th>
                  <th style={{ minWidth: 160 }}>Коментар</th>
                  <th className="sticky-r" />
                </tr>
              </thead>
              <tbody>
                {payroll.isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((__, j) => (
                      <td key={j}><span className="sk" style={{ display: "block", height: 14 }} /></td>
                    ))}</tr>
                  ))}
                {filtered.map((row) => {
                  const editable = row.basis === "MANUAL" && row.lesson_event_id == null;
                  const dateStr = row.lesson_date ? row.lesson_date.slice(0, 10) : row.created_at.slice(0, 10);
                  return (
                    <tr key={row.id} onClick={() => editable && setEditing(row)} style={editable ? undefined : { cursor: "default" }}>
                      <td className="sticky-l tnum-cell">{formatDateUk(dateStr)}</td>
                      <td><div className="cell-name">{row.teacher_name}</div></td>
                      <td>
                        <div className="cell-name">{row.club_name ?? "Ручне нарахування"}</div>
                        <div className="cell-sub">{row.lesson_event_id ? `урок #${row.lesson_event_id}` : "бонус · без уроку"}</div>
                      </td>
                      <td>
                        <span className={`tag ${row.basis === "AUTO" ? "update" : "enroll"}`}>
                          {row.basis === "AUTO" ? "за урок" : "бонус"}
                        </span>
                      </td>
                      <td className="tnum-cell"><b>{formatCurrency(Number(row.amount_decimal))} грн</b></td>
                      <td><div className="cell-sub">{row.note || "—"}</div></td>
                      <td className="sticky-r" onClick={(e) => e.stopPropagation()}>
                        {canManage && (
                        <div className="row-actions">
                          <button className="row-btn" title={editable ? "Редагувати" : "Авто-нарахування редагується у «Проведених уроках»"} disabled={!editable} onClick={() => setEditing(row)}><IconPencil /></button>
                          <button className="row-btn danger" title={editable ? "Видалити" : "Авто-нарахування видаляється у «Проведених уроках»"} disabled={!editable} onClick={() => setDeleting(row)}><IconTrash /></button>
                        </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {payroll.error && (
              <div className="table-empty">
                <div className="big">{payroll.error instanceof ApiError && payroll.error.status === 403 ? "Немає доступу" : "Не вдалося завантажити дані"}</div>
                {payroll.error instanceof ApiError ? payroll.error.message : "Спробуйте оновити сторінку"}
              </div>
            )}
            {!payroll.isLoading && !payroll.error && filtered.length === 0 && (
              <div className="table-empty">
                <div className="big">{hasFilters ? "Нічого не знайдено" : "Нарахувань ще немає"}</div>
                {hasFilters ? "Змініть фільтри або пошук" : "Додайте ручний бонус або проведіть уроки"}
              </div>
            )}
          </div>
          <div className="table-foot">
            <span>Показано {formatNumber(filtered.length)} нарахувань на {formatCurrency(total)} грн</span>
          </div>
        </div>
      </div>

      {calcOpen && <CalcModal onClose={() => setCalcOpen(false)} />}
      {editing !== null && <PayrollForm record={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Видалити нарахування?</h3>
              <button className="close" aria-label="Закрити" onClick={() => setDeleting(null)}><IconClose /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
                <b>{deleting.teacher_name}</b>, {formatCurrency(Number(deleting.amount_decimal))} грн.
                Це ручне нарахування буде видалено. Автоматичні (за уроки) видаляються через «Проведені уроки».
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn secondary" onClick={() => setDeleting(null)}>Скасувати</button>
              <button className="btn danger" disabled={remove.isPending} onClick={() => remove.mutate(deleting.id)}>
                {remove.isPending ? "Видаляємо…" : "Видалити"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
