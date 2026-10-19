import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { formatDateUk, formatNumber } from "../../lib/format";
import { IconClose, IconPlus, IconSearch } from "../../lib/icons";
import { TopNav } from "../../components/layout/TopNav";
import { ExportLink } from "../../components/admin/primitives";
import { useScrollShades } from "../../components/admin/useScrollShades";
import { dashboardQueries } from "../dashboard/api";
import { teachersApi, teachersLinks, teachersQueries } from "./api";
import { TeacherFormModal } from "./TeacherFormModal";
import type { Teacher, TeacherImportResult } from "./types";

type SortKey = "name" | "birth_date" | "lessons" | "created_at";

const IconPencil = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 3a2.8 2.8 0 114 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
);
const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" /></svg>
);
const IconUpload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
);
const IconDownload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
);
const IconLink = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
);

const PAGE_SIZE = 25;
const TG_OK = "Підключено";

function TeacherLessonsModal({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  const details = useQuery(teachersQueries.statDetails(teacher.id, "completed"));
  const rows = details.data ?? [];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Проведені уроки · {teacher.full_name}<span className="chip" style={{ marginLeft: 10 }}>{rows.length}</span></h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {details.isLoading && <div className="empty-inline">Завантаження…</div>}
          {details.error instanceof ApiError && <div className="form-error">{details.error.message}</div>}
          {!details.isLoading && !details.error && rows.length === 0 && (
            <div className="empty-inline">Немає проведених уроків</div>
          )}
          {rows.map((l) => (
            <div className="sinfo-row" key={l.id}>
              <span className="day-badge"><b>{formatDateUk(l.date).slice(0, 5)}</b></span>
              <div className="sinfo-main">
                <div className="sinfo-name">{l.club_name}{l.group_name ? ` · ${l.group_name}` : ""}</div>
                <div className="sinfo-meta">{formatDateUk(l.date)}{l.notes ? ` · ${l.notes}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}

export function TeachersPage() {
  const qc = useQueryClient();
  const summary = useQuery(dashboardQueries.summary());
  const teachers = useQuery(teachersQueries.list());
  const schedules = useQuery(teachersQueries.schedules());

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [clubFilter, setClubFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<Teacher | null | "new">(null);
  const [detailsOf, setDetailsOf] = useState<Teacher | null>(null);

  // Переходи з глобального пошуку/швидких дій: ?q= фільтрує список, ?new=1 відкриває форму
  const [urlParams, setUrlParams] = useSearchParams();
  useEffect(() => {
    const q = urlParams.get("q");
    const wantNew = urlParams.get("new");
    if (q === null && wantNew === null) return;
    if (q !== null) {
      setSearch(q);
      setPage(1);
    }
    if (wantNew !== null) setEditing("new");
    setUrlParams({}, { replace: true }); // параметри разові — прибираємо з URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParams]);
  const [deleting, setDeleting] = useState<Teacher | null>(null);
  const [forceDelete, setForceDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<TeacherImportResult | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useScrollShades<HTMLDivElement>();

  const s = summary.data;
  const counts = s
    ? {
        students: s.stats.students,
        teachers: s.stats.teachers,
        clubs: s.stats.clubs,
        active_schedules: s.stats.active_schedules,
      }
    : {};

  // Гуртки, які викладає кожен вчитель (через активні розклади, включно з co-teachers)
  const clubsByTeacher = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const sch of schedules.data ?? []) {
      if (!sch.active || !sch.club_name) continue;
      const teacherIds = new Set<number>([sch.teacher_id]);
      for (const t of sch.teachers ?? []) teacherIds.add(t.teacher_id);
      for (const tid of teacherIds) {
        const set = map.get(tid) ?? new Set<string>();
        set.add(sch.club_name);
        map.set(tid, set);
      }
    }
    return map;
  }, [schedules.data]);

  const allClubNames = useMemo(() => {
    const set = new Set<string>();
    for (const names of clubsByTeacher.values()) for (const n of names) set.add(n);
    return [...set].sort((a, b) => a.localeCompare(b, "uk"));
  }, [clubsByTeacher]);

  const filtered = useMemo(() => {
    let list = teachers.data ?? [];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) => t.full_name.toLowerCase().includes(q));
    if (statusFilter === "active") list = list.filter((t) => t.active);
    else if (statusFilter === "inactive") list = list.filter((t) => !t.active);
    else if (statusFilter === "tg") list = list.filter((t) => t.tg_chat_id != null);
    else if (statusFilter === "no_tg") list = list.filter((t) => t.tg_chat_id == null);
    if (clubFilter) list = list.filter((t) => clubsByTeacher.get(t.id)?.has(clubFilter));

    const dir = sortDir;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "name": return dir * a.full_name.localeCompare(b.full_name, "uk");
        case "birth_date": return dir * String(a.birth_date ?? "").localeCompare(String(b.birth_date ?? ""));
        case "lessons": return dir * (a.conducted_lessons_count - b.conducted_lessons_count);
        case "created_at": return dir * a.created_at.localeCompare(b.created_at);
        default: return 0;
      }
    });
  }, [teachers.data, search, statusFilter, clubFilter, sortKey, sortDir, clubsByTeacher]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }
  const arrow = (key: SortKey) =>
    sortKey === key ? <span className="arr">{sortDir === 1 ? "▲" : "▼"}</span> : null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["teachers"] });
    qc.invalidateQueries({ queryKey: ["schedules"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const toggleActive = useMutation({
    mutationFn: (id: number) => teachersApi.toggleActive(id),
    onSuccess: invalidate,
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Не вдалося змінити статус"),
  });

  const remove = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) => teachersApi.remove(id, force),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      setForceDelete(false);
    },
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Не вдалося видалити вчителя"),
  });

  const importMut = useMutation({
    mutationFn: (file: File) => teachersApi.importExcel(file),
    onSuccess: (res) => {
      setImportResult(res);
      invalidate();
    },
    onError: (err) => {
      setImportResult({
        success: false,
        message: err instanceof ApiError ? err.message : "Не вдалося імпортувати файл",
        created_count: 0,
        skipped_count: 0,
        errors: [],
      });
    },
  });

  async function copyCalendarLink(teacher: Teacher) {
    try {
      const { link } = await teachersApi.calendarLink(teacher.id);
      await navigator.clipboard.writeText(link);
      setCopiedId(teacher.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setActionError("Не вдалося отримати посилання на календар");
    }
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setClubFilter("");
    setPage(1);
  }
  const hasFilters = search || statusFilter || clubFilter;

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
            <h2>Вчителі</h2>
            <p>
              {teachers.data
                ? `${formatNumber(teachers.data.length)} вчителів · ${teachers.data.filter((t) => t.active).length} активних`
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
              placeholder="Пошук за ПІБ…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select className="tselect" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">Статус: всі</option>
            <option value="active">Активні</option>
            <option value="inactive">Неактивні</option>
            <option value="tg">З Telegram</option>
            <option value="no_tg">Без Telegram</option>
          </select>
          <select className="tselect" value={clubFilter} onChange={(e) => { setClubFilter(e.target.value); setPage(1); }}>
            <option value="">Гурток: всі</option>
            {allClubNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {hasFilters && <button className="btn ghost" onClick={resetFilters}>Скинути</button>}
          <span className="spacer" />
          <a className="btn ghost" href={teachersLinks.template}><IconDownload />Шаблон</a>
          <button className="btn ghost" onClick={() => { setImportResult(null); setImportOpen(true); }}>
            <IconUpload />Імпорт
          </button>
          <ExportLink href={teachersLinks.exportExcel} disabled={(teachers.data ?? []).length === 0} />
          <button className="btn" onClick={() => setEditing("new")}><IconPlus /><span>Додати вчителя</span></button>
        </div>

        <div className="table-card">
          <div className="table-scroll" ref={scrollRef}>
            <table className="dtable" style={{ minWidth: 1040 }}>
              <thead>
                <tr>
                  <th className="sortable sticky-l" onClick={() => toggleSort("name")} style={{ minWidth: 200 }}>ПІБ {arrow("name")}</th>
                  <th className="sortable col-center" onClick={() => toggleSort("birth_date")}>Народження {arrow("birth_date")}</th>
                  <th className="col-center">Telegram</th>
                  <th style={{ minWidth: 180 }}>Викладає гуртки</th>
                  <th className="sortable col-center" onClick={() => toggleSort("lessons")} style={{ minWidth: 150 }}>Уроки · цей місяць {arrow("lessons")}</th>
                  <th className="col-center">Статус</th>
                  <th className="sortable col-center" onClick={() => toggleSort("created_at")}>Доданий {arrow("created_at")}</th>
                  <th className="sticky-r" />
                </tr>
              </thead>
              <tbody>
                {teachers.isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j}><span className="sk" style={{ display: "block", height: 14 }} /></td>
                      ))}
                    </tr>
                  ))}
                {pageRows.map((t) => {
                  const tClubs = [...(clubsByTeacher.get(t.id) ?? [])];
                  return (
                    <tr key={t.id} onClick={() => setEditing(t)} style={t.active ? undefined : { opacity: 0.6 }}>
                      <td className="sticky-l"><div className="cell-name">{t.full_name}</div></td>
                      <td className="tnum-cell cell-muted col-center">{formatDateUk(t.birth_date)}</td>
                      <td className="col-center">
                        {t.tg_chat_id != null ? (
                          <span className="tag create">{TG_OK}</span>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </td>
                      <td>
                        {tClubs.length ? (
                          <ul className="vlist">
                            {tClubs.map((n) => <li key={n}>{n}</li>)}
                          </ul>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </td>
                      <td className="col-center">
                        {t.conducted_lessons_count > 0 ? (
                          <button
                            className="link"
                            style={{ marginTop: 0, color: "var(--green)", fontWeight: 700 }}
                            onClick={() => setDetailsOf(t)}
                            title="Показати проведені уроки"
                          >
                            {t.conducted_lessons_count} проведено
                          </button>
                        ) : (
                          t.missed_lessons_count === 0 && t.unmarked_lessons_count === 0 && (
                            <span className="cell-muted">без занять</span>
                          )
                        )}
                        {t.missed_lessons_count > 0 && (
                          <div className="cell-sub" style={{ color: "var(--crimson)" }}>
                            {t.missed_lessons_count} пропущено
                          </div>
                        )}
                        {t.unmarked_lessons_count > 0 && (
                          <div className="cell-sub" style={{ color: "var(--gold-text)" }}>
                            {t.unmarked_lessons_count} без відмітки
                          </div>
                        )}
                      </td>
                      <td className="col-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          className={`switch${t.active ? " on" : ""}`}
                          role="switch"
                          aria-checked={t.active}
                          title={t.active ? "Деактивувати" : "Активувати"}
                          disabled={toggleActive.isPending}
                          onClick={() => toggleActive.mutate(t.id)}
                        />
                      </td>
                      <td className="tnum-cell cell-muted col-center">{formatDateUk(t.created_at.slice(0, 10))}</td>
                      <td className="sticky-r" onClick={(e) => e.stopPropagation()}>
                        <div className="row-actions">
                          <button
                            className="row-btn"
                            title={copiedId === t.id ? "Скопійовано!" : "Копіювати лінк календаря"}
                            style={copiedId === t.id ? { background: "var(--olive)", color: "#fff", borderColor: "var(--olive)" } : undefined}
                            onClick={() => copyCalendarLink(t)}
                          >
                            <IconLink />
                          </button>
                          <button className="row-btn" title="Редагувати" onClick={() => setEditing(t)}><IconPencil /></button>
                          <button className="row-btn danger" title="Видалити" onClick={() => { setForceDelete(false); setDeleting(t); }}><IconTrash /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {teachers.error && (
              <div className="table-empty">
                <div className="big">{teachers.error instanceof ApiError && teachers.error.status === 403 ? "Немає доступу" : "Не вдалося завантажити дані"}</div>
                {teachers.error instanceof ApiError ? teachers.error.message : "Спробуйте оновити сторінку"}
              </div>
            )}
            {!teachers.isLoading && !teachers.error && filtered.length === 0 && (
              <div className="table-empty">
                <div className="big">{hasFilters ? "Нічого не знайдено" : "Вчителів ще немає"}</div>
                {hasFilters ? "Спробуйте змінити пошук або фільтри" : "Додайте першого вчителя"}
              </div>
            )}
          </div>
          <div className="table-foot">
            <span>
              Показано {pageRows.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}–
              {(safePage - 1) * PAGE_SIZE + pageRows.length} з {formatNumber(filtered.length)}
            </span>
            {pages > 1 && (
              <div className="pager">
                <button disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹</button>
                {Array.from({ length: pages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === pages || Math.abs(p - safePage) <= 2)
                  .map((p, idx, arr) => (
                    <span key={p}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: "0 4px" }}>…</span>}
                      <button className={p === safePage ? "on" : ""} onClick={() => setPage(p)}>{p}</button>
                    </span>
                  ))}
                <button disabled={safePage === pages} onClick={() => setPage(safePage + 1)}>›</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {editing !== null && (
        <TeacherFormModal
          teacher={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {detailsOf && <TeacherLessonsModal teacher={detailsOf} onClose={() => setDetailsOf(null)} />}

      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Видалити вчителя?</h3>
              <button className="close" aria-label="Закрити" onClick={() => setDeleting(null)}><IconClose /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13.5, color: "var(--text-2)", marginBottom: 12 }}>
                <b>{deleting.full_name}</b>: якщо у вчителя є уроки, нарахування, тарифи чи розклади,
                без повного видалення його буде <b>деактивовано</b> (історія збережеться).
              </p>
              <label className={`check${forceDelete ? " on" : ""}`}>
                <input type="checkbox" checked={forceDelete} onChange={() => setForceDelete((v) => !v)} />
                Видалити повністю разом з історією (незворотно)
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn secondary" onClick={() => setDeleting(null)}>Скасувати</button>
              <button
                className="btn danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: deleting.id, force: forceDelete })}
              >
                {remove.isPending ? "Виконуємо…" : forceDelete ? "Видалити повністю" : "Видалити / деактивувати"}
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="modal-overlay" onClick={() => setImportOpen(false)}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Імпорт вчителів з Excel</h3>
              <button className="close" aria-label="Закрити" onClick={() => setImportOpen(false)}><IconClose /></button>
            </div>
            <div className="modal-body">
              {importResult && (
                <div className={importResult.success ? "form-ok" : "form-error"}>
                  {importResult.message}
                  {importResult.success &&
                    ` Створено: ${importResult.created_count}, пропущено: ${importResult.skipped_count}.`}
                  {importResult.errors.slice(0, 5).map((er) => <div key={er}>{er}</div>)}
                </div>
              )}
              <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 14 }}>
                Використовуйте <a className="link" href={teachersLinks.template}>шаблон Excel</a> —
                колонки мають збігатися з ним.
              </p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ fontSize: 13, fontFamily: "inherit" }} />
            </div>
            <div className="modal-foot">
              <button className="btn secondary" onClick={() => setImportOpen(false)}>Закрити</button>
              <button
                className="btn"
                disabled={importMut.isPending}
                onClick={() => {
                  const file = fileRef.current?.files?.[0];
                  if (file) importMut.mutate(file);
                }}
              >
                {importMut.isPending ? "Імпортуємо…" : "Імпортувати"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
