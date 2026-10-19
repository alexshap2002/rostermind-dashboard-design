import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { formatCurrency, formatDateUk, formatNumber } from "../../lib/format";
import { IconClose, IconPencil, IconPlus, IconSearch, IconTrash } from "../../lib/icons";
import { TopNav } from "../../components/layout/TopNav";
import { useScrollShades } from "../../components/admin/useScrollShades";
import { dashboardQueries } from "../dashboard/api";
import { teachersQueries } from "../teachers/api";
import { payRatesApi, payRatesQueries, type PayRate } from "./api";

function PayRateForm({ rate, onClose }: { rate: PayRate | null; onClose: () => void }) {
  const qc = useQueryClient();
  const teachers = useQuery(teachersQueries.list());
  const [teacherId, setTeacherId] = useState(rate ? String(rate.teacher_id) : "");
  const [amount, setAmount] = useState(rate ? String(Number(rate.amount_decimal)) : "");
  const [activeFrom, setActiveFrom] = useState(rate?.active_from ?? new Date().toISOString().slice(0, 10));
  const [activeTo, setActiveTo] = useState(rate?.active_to ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        teacher_id: Number(teacherId),
        rate_type: "PER_LESSON" as const,
        amount_decimal: Number(amount),
        active_from: activeFrom,
        active_to: activeTo || null,
      };
      return rate ? payRatesApi.update(rate.id, payload) : payRatesApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pay-rates"] });
      qc.invalidateQueries({ queryKey: ["teachers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Не вдалося зберегти тариф"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!teacherId) return setError("Оберіть вчителя");
    if (!amount || Number(amount) <= 0) return setError("Вкажіть додатню суму");
    if (!activeFrom) return setError("Вкажіть дату початку");
    save.mutate();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card narrow" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="modal-head">
          <h3>{rate ? "Редагувати тариф" : "Додати тариф"}</h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}
          <div className="fgrid">
            <div className="field span-12">
              <label htmlFor="rate-teacher">Вчитель *</label>
              <select id="rate-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={rate != null}>
                <option value="">Оберіть вчителя…</option>
                {(teachers.data ?? [])
                  .filter((t) => t.active || String(t.id) === teacherId)
                  .map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div className="field span-6">
              <label htmlFor="rate-amount">Сума за урок, грн *</label>
              <input id="rate-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field span-6">
              <label htmlFor="rate-from">Діє з *</label>
              <input id="rate-from" type="date" value={activeFrom} onChange={(e) => setActiveFrom(e.target.value)} />
            </div>
            <div className="field span-6">
              <label htmlFor="rate-to">Діє до</label>
              <input id="rate-to" type="date" value={activeTo} onChange={(e) => setActiveTo(e.target.value)} />
            </div>
          </div>
          <div className="cell-sub" style={{ marginTop: 4 }}>
            У вчителя може бути лише одна активна ставка. Щоб додати нову — спершу закрийте попередню
            (вкажіть їй дату «Діє до»).
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="btn" disabled={save.isPending}>
            {save.isPending ? "Зберігаємо…" : rate ? "Зберегти зміни" : "Додати тариф"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function PayRatesPage() {
  const qc = useQueryClient();
  const summary = useQuery(dashboardQueries.summary());
  const teachers = useQuery(teachersQueries.list());
  const [search, setSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [editing, setEditing] = useState<PayRate | null | "new">(null);
  const [deleting, setDeleting] = useState<PayRate | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const rates = useQuery(payRatesQueries.list(teacherFilter));
  const scrollRef = useScrollShades<HTMLDivElement>();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rates.data ?? []).filter((rate) => {
      if (q && !rate.teacher_name.toLowerCase().includes(q)) return false;
      if (statusFilter === "active" && !rate.is_active) return false;
      if (statusFilter === "inactive" && rate.is_active) return false;
      return true;
    });
  }, [rates.data, search, statusFilter]);

  const activeRates = (rates.data ?? []).filter((r) => r.is_active);
  const avgActive = activeRates.length
    ? activeRates.reduce((sum, r) => sum + Number(r.amount_decimal || 0), 0) / activeRates.length
    : 0;
  const hasFilters = search || teacherFilter || statusFilter !== "active";

  const s = summary.data;
  const counts = s
    ? { students: s.stats.students, teachers: s.stats.teachers, clubs: s.stats.clubs, active_schedules: s.stats.active_schedules }
    : {};

  const remove = useMutation({
    mutationFn: (id: number) => payRatesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pay-rates"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleting(null);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Не вдалося видалити тариф"),
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
            <h2>Тарифи</h2>
            <p>
              {rates.data
                ? `${formatNumber(rates.data.length)} ставок · активних ${formatNumber(activeRates.length)}`
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
            <input placeholder="Пошук за вчителем…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="tselect" value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
            <option value="">Вчитель: всі</option>
            {(teachers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
          <select className="tselect" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="active">Активні</option>
            <option value="all">Всі</option>
            <option value="inactive">Неактивні</option>
          </select>
          {hasFilters && (
            <button className="btn ghost" onClick={() => { setSearch(""); setTeacherFilter(""); setStatusFilter("active"); }}>Скинути</button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={() => setEditing("new")}><IconPlus /><span>Додати тариф</span></button>
        </div>

        <div className="metric-strip">
          <div><b>{formatNumber(rates.data?.length ?? 0)}</b><span>всього ставок</span></div>
          <div><b>{formatNumber(activeRates.length)}</b><span>активних</span></div>
          <div><b>{formatCurrency(avgActive)} грн</b><span>середня активна</span></div>
        </div>

        <div className="table-card">
          <div className="table-scroll" ref={scrollRef}>
            <table className="dtable" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th className="sticky-l" style={{ minWidth: 200 }}>Вчитель</th>
                  <th>Тип</th>
                  <th>Сума за урок</th>
                  <th style={{ minWidth: 150 }}>Період дії</th>
                  <th>Статус</th>
                  <th>Створено</th>
                  <th className="sticky-r" />
                </tr>
              </thead>
              <tbody>
                {rates.isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((__, j) => (
                      <td key={j}><span className="sk" style={{ display: "block", height: 14 }} /></td>
                    ))}</tr>
                  ))}
                {filtered.map((rate) => (
                  <tr key={rate.id} onClick={() => setEditing(rate)}>
                    <td className="sticky-l"><div className="cell-name">{rate.teacher_name}</div></td>
                    <td><span className="tag update">За урок</span></td>
                    <td className="tnum-cell"><b>{formatCurrency(Number(rate.amount_decimal))} грн</b></td>
                    <td className="tnum-cell">
                      <div>з {formatDateUk(rate.active_from)}</div>
                      <div className="cell-sub">{rate.active_to ? `до ${formatDateUk(rate.active_to)}` : "безстроково"}</div>
                    </td>
                    <td>
                      <span className={`tag ${rate.is_active ? "create" : ""}`}>{rate.is_active ? "Активний" : "Завершений"}</span>
                    </td>
                    <td className="tnum-cell cell-muted">{formatDateUk(rate.created_at.slice(0, 10))}</td>
                    <td className="sticky-r" onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <button className="row-btn" title="Редагувати" onClick={() => setEditing(rate)}><IconPencil /></button>
                        <button className="row-btn danger" title="Видалити" onClick={() => setDeleting(rate)}><IconTrash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rates.isLoading && filtered.length === 0 && (
              <div className="table-empty">
                <div className="big">{hasFilters ? "Нічого не знайдено" : "Тарифів ще немає"}</div>
                {hasFilters ? "Змініть фільтри або пошук" : "Додайте першу ставку для вчителя"}
              </div>
            )}
          </div>
          <div className="table-foot">
            <span>Показано {formatNumber(filtered.length)} із {formatNumber(rates.data?.length ?? 0)} ставок</span>
          </div>
        </div>
      </div>

      {editing !== null && <PayRateForm rate={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Видалити тариф?</h3>
              <button className="close" aria-label="Закрити" onClick={() => setDeleting(null)}><IconClose /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
                <b>{deleting.teacher_name}</b>, {formatCurrency(Number(deleting.amount_decimal))} грн за урок.
                Уже нараховані зарплати за цим тарифом залишаться, але ставку буде прибрано зі списку.
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
