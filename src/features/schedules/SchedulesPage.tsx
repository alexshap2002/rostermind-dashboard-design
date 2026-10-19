import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { formatNumber, pluralUk } from "../../lib/format";
import { IconClose, IconPlus, IconSearch, IconStudents } from "../../lib/icons";
import { TopNav } from "../../components/layout/TopNav";
import { ExportLink, useCanManage } from "../../components/admin/primitives";
import { dashboardQueries } from "../dashboard/api";
import {
  schedulesApi, schedulesLinks, schedulesQueries, WEEKDAY_FULL, hhmm, type ScheduleV2,
} from "./api";
import { ScheduleFormModal } from "./ScheduleFormModal";
import { StudentsManageModal } from "./StudentsManageModal";

const IconPencil = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 3a2.8 2.8 0 114 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
);
const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" /></svg>
);

export function SchedulesPage() {
  const canManage = useCanManage();
  const qc = useQueryClient();
  const summary = useQuery(dashboardQueries.summary());
  const schedules = useQuery(schedulesQueries.list());
  const clubs = useQuery(schedulesQueries.clubs());
  const teachers = useQuery({ ...schedulesQueries.teachers(), enabled: canManage });

  const [search, setSearch] = useState("");
  const [clubFilter, setClubFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const [editing, setEditing] = useState<ScheduleV2 | null | "new">(null);
  // ?new=1 («Що далі?») відкриває форму, як і кнопка «Додати заняття»; параметр разовий
  const [urlParams, setUrlParams] = useSearchParams();
  useEffect(() => {
    // Поки summary вантажиться, роль невідома — інакше параметр зник би без форми
    if (urlParams.get("new") === null || !summary.data) return;
    if (canManage) setEditing("new");
    setUrlParams({}, { replace: true });
  }, [urlParams, setUrlParams, canManage, summary.data]);
  const [managing, setManaging] = useState<ScheduleV2 | null>(null);
  const [deleting, setDeleting] = useState<ScheduleV2 | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const s = summary.data;
  const counts = s
    ? {
        students: s.stats.students,
        teachers: s.stats.teachers,
        clubs: s.stats.clubs,
        active_schedules: s.stats.active_schedules,
      }
    : {};

  const filtered = useMemo(() => {
    let list = schedules.data ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((sch) =>
        [sch.club_name, sch.group_name, ...sch.teachers.map((t) => t.teacher_name)]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    if (clubFilter) list = list.filter((sch) => sch.club_id === Number(clubFilter));
    if (teacherFilter) {
      const tid = Number(teacherFilter);
      list = list.filter((sch) => sch.teachers.some((t) => t.teacher_id === tid));
    }
    if (statusFilter === "active") list = list.filter((sch) => sch.active);
    else if (statusFilter === "inactive") list = list.filter((sch) => !sch.active);
    return list;
  }, [schedules.data, search, clubFilter, teacherFilter, statusFilter]);

  // Групуємо по днях тижня (1–7), всередині — за часом
  const byDay = useMemo(() => {
    const map = new Map<number, ScheduleV2[]>();
    for (const sch of filtered) {
      const arr = map.get(sch.weekday) ?? [];
      arr.push(sch);
      map.set(sch.weekday, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
    return map;
  }, [filtered]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["schedules"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const toggle = useMutation({
    mutationFn: (sch: ScheduleV2) =>
      sch.active ? schedulesApi.deactivate(sch.id) : schedulesApi.reactivate(sch.id),
    onSuccess: invalidate,
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Не вдалося змінити статус"),
  });

  const remove = useMutation({
    mutationFn: (id: number) => schedulesApi.remove(id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
    },
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Не вдалося видалити заняття"),
  });

  const hasFilters = search || clubFilter || teacherFilter || statusFilter !== "active";
  const totalShown = filtered.length;
  const activeCount = (schedules.data ?? []).filter((x) => x.active).length;

  // 401 перевіряємо ПІСЛЯ всіх хуків (інакше порушується порядок хуків React)
  if (summary.error instanceof ApiError && summary.error.status === 401) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <TopNav counts={counts} user={s?.user} tenantName={s?.tenant.name} />

      <div className="content wide">
        <div className="page-head">
          <div>
            <h2>Розклад</h2>
            <p>
              {schedules.data
                ? `Всього ${formatNumber(schedules.data.length)} ${pluralUk(schedules.data.length, "заняття", "заняття", "занять")} · активних ${formatNumber(activeCount)} · неактивних ${formatNumber(schedules.data.length - activeCount)}`
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
            <input
              placeholder="Пошук: гурток, група, вчитель…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="tselect" value={clubFilter} onChange={(e) => setClubFilter(e.target.value)}>
            <option value="">Гурток: всі</option>
            {(clubs.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {canManage && (
            <select className="tselect" value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
              <option value="">Вчитель: всі</option>
              {(teachers.data ?? [])
                .filter((t) => t.active)
                .map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          )}
          <select className="tselect" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="active">Активні</option>
            <option value="all">Всі заняття</option>
            <option value="inactive">Неактивні</option>
          </select>
          {hasFilters && (
            <button className="btn ghost" onClick={() => { setSearch(""); setClubFilter(""); setTeacherFilter(""); setStatusFilter("active"); }}>
              Скинути
            </button>
          )}
          <span className="spacer" />
          {canManage && <ExportLink href={schedulesLinks.exportExcel} disabled={(schedules.data ?? []).length === 0} />}
          {canManage && (
            <button className="btn" onClick={() => setEditing("new")}><IconPlus /><span>Додати заняття</span></button>
          )}
        </div>

        {schedules.isLoading && (
          <div className="day-card">
            <div className="pane-list" style={{ padding: 20 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className="sk" style={{ display: "block", height: 40, marginBottom: 10 }} />
              ))}
            </div>
          </div>
        )}

        {schedules.error && (
          <div className="table-card">
            <div className="table-empty">
              <div className="big">{schedules.error instanceof ApiError && schedules.error.status === 403 ? "Немає доступу" : "Не вдалося завантажити дані"}</div>
              {schedules.error instanceof ApiError ? schedules.error.message : "Спробуйте оновити сторінку"}
            </div>
          </div>
        )}
        {!schedules.isLoading && !schedules.error && totalShown === 0 && (
          <div className="table-card">
            <div className="table-empty">
              <div className="big">{hasFilters ? "Нічого не знайдено" : "Розклад порожній"}</div>
              {hasFilters ? "Спробуйте змінити пошук або фільтри" : "Додайте перше заняття"}
            </div>
          </div>
        )}

        {[1, 2, 3, 4, 5, 6, 7].map((day) => {
          const rows = byDay.get(day);
          if (!rows?.length) return null;
          return (
            <div className="day-card" key={day}>
              <div className="day-head">
                {WEEKDAY_FULL[day]}
                <span className="chip">{rows.length} {rows.length === 1 ? "заняття" : "занять"}</span>
              </div>
              {rows.map((sch) => (
                <div className={`sched-row${sch.active ? "" : " off"}`} key={sch.id} onClick={() => setEditing(sch)}>
                  <span className="sched-time">{hhmm(sch.start_time)}</span>
                  <div className="sched-club">
                    <div className="cell-name">{sch.club_name ?? "—"}</div>
                    {sch.group_name && <div className="cell-sub">{sch.group_name}</div>}
                  </div>
                  <div className="sched-teachers">
                    {sch.teachers.length ? (
                      <ul className="vlist olive">
                        {[...sch.teachers].sort((a, b) => a.order - b.order).map((t) => (
                          <li key={t.id}>{t.teacher_name}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="cell-muted">без вчителя</span>
                    )}
                  </div>
                  <button
                    className="btn ghost sched-students"
                    onClick={(e) => { e.stopPropagation(); setManaging(sch); }}
                    title="Керувати складом групи"
                  >
                    <IconStudents />
                    {sch.enrolled_count ?? 0} учнів
                  </button>
                  <span onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`switch${sch.active ? " on" : ""}`}
                      role="switch"
                      aria-checked={sch.active}
                      title={sch.active ? "Деактивувати (скасує майбутні уроки)" : "Активувати"}
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate(sch)}
                    />
                  </span>
                  {canManage && (
                    <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="row-btn" title="Редагувати" onClick={() => setEditing(sch)}><IconPencil /></button>
                      <button className="row-btn danger" title="Видалити" onClick={() => setDeleting(sch)}><IconTrash /></button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {editing !== null && (
        <ScheduleFormModal
          schedule={editing === "new" ? null : editing}
          clubs={clubs.data ?? []}
          teachers={teachers.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}

      {managing && <StudentsManageModal schedule={managing} onClose={() => setManaging(null)} />}

      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Видалити заняття?</h3>
              <button className="close" aria-label="Закрити" onClick={() => setDeleting(null)}><IconClose /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
                <b>{deleting.club_name}</b> · {WEEKDAY_FULL[deleting.weekday]} {hhmm(deleting.start_time)}
                {deleting.group_name ? ` · ${deleting.group_name}` : ""} — заняття буде видалено
                разом із записами групи ({formatNumber(deleting.enrolled_count ?? 0)} учнів) та
                майбутніми уроками. Якщо хочете лише призупинити — скористайтесь перемикачем статусу.
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
