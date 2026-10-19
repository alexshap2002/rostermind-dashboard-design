import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { ageUk, formatDateUk, formatNumber, formatPhoneUk } from "../../lib/format";
import { IconClose, IconPlus, IconSearch } from "../../lib/icons";
import { TopNav } from "../../components/layout/TopNav";
import { ExportLink, useCanManage } from "../../components/admin/primitives";
import { useScrollShades } from "../../components/admin/useScrollShades";
import { dashboardQueries } from "../dashboard/api";
import { criteriaQueries, marksByStudent } from "../settings/api";
import { studentsApi, studentsLinks, studentsQueries } from "./api";
import { StudentFormModal } from "./StudentFormModal";
import {
  slotTime, studentFullName,
  type ImportResult, type Student, type StudentLessonSlot,
} from "./types";

/** Скільки уроків показувати в рядку, решта — «ще N». */
const SCHEDULE_ROW_LIMIT = 4;

type SortKey = "name" | "birth_date" | "grade" | "clubs" | "created_at";

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

const PAGE_SIZE = 25;

export function StudentsPage() {
  const qc = useQueryClient();
  const canManage = useCanManage();
  const summary = useQuery(dashboardQueries.summary());
  const students = useQuery(studentsQueries.list());
  const clubs = useQuery(studentsQueries.clubs());
  const enrollments = useQuery(studentsQueries.enrollments());
  // Критерії вразливості — лише адміністрації (вчителям сервер їх і не віддає).
  const criteria = useQuery({ ...criteriaQueries.list(), enabled: canManage });
  const criteriaMarks = useQuery({ ...criteriaQueries.marks(), enabled: canManage });

  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [criterionFilter, setCriterionFilter] = useState("");
  const [clubFilter, setClubFilter] = useState("");
  const [slotFilter, setSlotFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<Student | null | "new">(null);

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
    // ?new=1 — це та сама дія, що й схована від вчителя кнопка, тож гейтимо однаково
    if (wantNew !== null && canManage) setEditing("new");
    setUrlParams({}, { replace: true }); // параметри разові — прибираємо з URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParams, canManage]);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
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

  // Гуртки кожного учня (для колонки і фільтра)
  const clubsByStudent = useMemo(() => {
    const byId = new Map<number, string>((clubs.data ?? []).map((c) => [c.id, c.name]));
    const map = new Map<number, { ids: number[]; names: string[] }>();
    for (const e of enrollments.data ?? []) {
      const entry = map.get(e.student_id) ?? { ids: [], names: [] };
      entry.ids.push(e.club_id);
      const name = byId.get(e.club_id);
      if (name) entry.names.push(name);
      map.set(e.student_id, entry);
    }
    return map;
  }, [clubs.data, enrollments.data]);

  const grades = useMemo(() => {
    const set = new Set<string>();
    for (const st of students.data ?? []) if (st.grade) set.add(st.grade);
    return [...set].sort((a, b) => a.localeCompare(b, "uk", { numeric: true }));
  }, [students.data]);

  // Заняття, на які записані діти: «Чт 17:00–17:50 Робототехніка» — за днем і часом.
  const slots = useMemo(() => {
    const byId = new Map<number, StudentLessonSlot>();
    for (const st of students.data ?? []) for (const l of st.schedule ?? []) byId.set(l.schedule_id, l);
    return [...byId.values()].sort(
      (a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time) || (a.club_name ?? "").localeCompare(b.club_name ?? "", "uk"),
    );
  }, [students.data]);

  const filtered = useMemo(() => {
    let list = students.data ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((st) =>
        [
          `${st.last_name} ${st.first_name}`, `${st.first_name} ${st.last_name}`,
          st.first_name, st.last_name, st.middle_name, st.phone_child,
          st.parent_name, st.mother_name, st.father_name, st.phone_mother,
          st.phone_father, st.location, st.grade,
          ...(st.schedule ?? []).map((l) => l.club_name),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    if (gradeFilter) list = list.filter((st) => st.grade === gradeFilter);
    if (criterionFilter) {
      const marks = marksByStudent(criteriaMarks.data);
      const count = (st: Student) => marks.get(st.id)?.length ?? 0;
      if (criterionFilter === "__any__") list = list.filter((st) => count(st) > 0);
      else if (criterionFilter === "__none__") list = list.filter((st) => count(st) === 0);
      else {
        const id = Number(criterionFilter);
        list = list.filter((st) => marks.get(st.id)?.includes(id));
      }
    }
    if (clubFilter) {
      const clubId = Number(clubFilter);
      list = list.filter((st) => clubsByStudent.get(st.id)?.ids.includes(clubId));
    }
    if (slotFilter) {
      const scheduleId = Number(slotFilter);
      list = list.filter((st) => (st.schedule ?? []).some((l) => l.schedule_id === scheduleId));
    }

    const dir = sortDir;
    const sorted = [...list].sort((a, b) => {
      switch (sortKey) {
        case "name": return dir * studentFullName(a).localeCompare(studentFullName(b), "uk");
        case "birth_date": return dir * String(a.birth_date ?? "").localeCompare(String(b.birth_date ?? ""));
        case "grade": return dir * String(a.grade ?? "").localeCompare(String(b.grade ?? ""), "uk", { numeric: true });
        case "clubs": return dir * ((clubsByStudent.get(a.id)?.ids.length ?? 0) - (clubsByStudent.get(b.id)?.ids.length ?? 0));
        case "created_at": return dir * a.created_at.localeCompare(b.created_at);
        default: return 0;
      }
    });
    return sorted;
  }, [students.data, search, gradeFilter, criterionFilter, criteriaMarks.data, clubFilter, slotFilter, sortKey, sortDir, clubsByStudent]);

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

  const remove = useMutation({
    mutationFn: (id: number) => studentsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["enrollments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleting(null);
    },
  });

  const importMut = useMutation({
    mutationFn: (file: File) => studentsApi.importExcel(file),
    onSuccess: (res) => {
      setImportResult(res);
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["vulnerability-criteria"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => {
      setImportResult({
        success: false,
        message: err instanceof ApiError ? err.message : "Не вдалося імпортувати файл",
        created_count: 0,
        skipped_count: 0,
        errors: [],
        warnings: [],
      });
    },
  });

  function resetFilters() {
    setSearch("");
    setGradeFilter("");
    setCriterionFilter("");
    setClubFilter("");
    setSlotFilter("");
    setPage(1);
  }
  const hasFilters = search || gradeFilter || criterionFilter || clubFilter || slotFilter;

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
            <h2>Учні</h2>
            <p>
              {students.data
                ? `${formatNumber(students.data.length)} активних учнів · ${s?.tenant.name ?? ""}`
                : "Завантаження…"}
            </p>
          </div>
        </div>

        <div className="toolbar">
          <div className="tsearch">
            <IconSearch />
            <input
              placeholder="Пошук: ім'я, телефон, батьки…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select className="tselect" value={gradeFilter} onChange={(e) => { setGradeFilter(e.target.value); setPage(1); }}>
            <option value="">Клас: всі</option>
            {grades.map((g) => <option key={g} value={g}>Клас {g}</option>)}
          </select>
          {canManage && (
            <select className="tselect" value={criterionFilter} onChange={(e) => { setCriterionFilter(e.target.value); setPage(1); }}>
              <option value="">Критерії: всі</option>
              <option value="__any__">З критеріями</option>
              <option value="__none__">Без критеріїв</option>
              {(criteria.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select className="tselect" value={clubFilter} onChange={(e) => { setClubFilter(e.target.value); setPage(1); }}>
            <option value="">Гурток: всі</option>
            {(clubs.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {slots.length > 1 && (
            <select className="tselect" aria-label="Заняття" value={slotFilter} onChange={(e) => { setSlotFilter(e.target.value); setPage(1); }}>
              <option value="">Розклад: усі</option>
              {slots.map((l) => (
                <option key={l.schedule_id} value={l.schedule_id}>
                  {slotTime(l)} {l.club_name ?? "Заняття"}
                </option>
              ))}
            </select>
          )}
          {hasFilters && (
            <button className="btn ghost" onClick={resetFilters}>Скинути</button>
          )}
          <span className="spacer" />
          {canManage && (
            <>
              <a className="btn ghost" href={studentsLinks.template}><IconDownload />Шаблон</a>
              <button className="btn ghost" onClick={() => { setImportResult(null); setImportOpen(true); }}>
                <IconUpload />Імпорт
              </button>
            </>
          )}
          {canManage && <ExportLink href={studentsLinks.exportExcel} disabled={(students.data ?? []).length === 0} />}
          {canManage && (
            <button className="btn" onClick={() => setEditing("new")}><IconPlus /><span>Додати учня</span></button>
          )}
        </div>

        <div className="table-card">
          <div className="table-scroll" ref={scrollRef}>
            <table className="dtable" style={{ minWidth: 920 }}>
              <thead>
                <tr>
                  <th className="sortable sticky-l" onClick={() => toggleSort("name")} style={{ minWidth: 220 }}>ПІБ {arrow("name")}</th>
                  <th style={{ minWidth: 220 }}>Розклад</th>
                  <th className="sortable col-center" onClick={() => toggleSort("birth_date")} style={{ minWidth: 130 }}>Народження · вік {arrow("birth_date")}</th>
                  <th className="sortable col-center" onClick={() => toggleSort("grade")} style={{ minWidth: 90 }}>Клас {arrow("grade")}</th>
                  <th className="col-center" style={{ minWidth: 160 }}>Місце проживання</th>
                  {canManage && <th className="sticky-r" />}
                </tr>
              </thead>
              <tbody>
                {students.isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: canManage ? 6 : 5 }).map((__, j) => (
                        <td key={j}><span className="sk" style={{ display: "block", height: 14 }} /></td>
                      ))}
                    </tr>
                  ))}
                {pageRows.map((st) => (
                  <tr key={st.id} onClick={() => setEditing(st)}>
                    <td className="sticky-l">
                      <div className="cell-name">{studentFullName(st)}</div>
                      {st.phone_child && <div className="cell-sub tnum">{formatPhoneUk(st.phone_child)}</div>}
                    </td>
                    <td>
                      {(st.schedule ?? []).length > 0 ? (
                        <>
                          <ul className="vlist gold">
                            {(st.schedule ?? []).slice(0, SCHEDULE_ROW_LIMIT).map((l) => (
                              <li key={l.schedule_id} title={l.group_name ?? undefined}>
                                <span><b className="tnum">{slotTime(l)}</b> {l.club_name ?? "Заняття"}</span>
                              </li>
                            ))}
                          </ul>
                          {(st.schedule ?? []).length > SCHEDULE_ROW_LIMIT && (
                            <div className="cell-sub">ще {(st.schedule ?? []).length - SCHEDULE_ROW_LIMIT}</div>
                          )}
                        </>
                      ) : (
                        <span className="cell-muted">—</span>
                      )}
                    </td>
                    <td className="tnum-cell col-center">
                      <div>{formatDateUk(st.birth_date)}</div>
                      {st.age != null && <div className="cell-sub">{ageUk(st.age)}</div>}
                    </td>
                    <td className="tnum-cell col-center">{st.grade ?? "—"}</td>
                    <td className="col-center">
                      {st.location ? (
                        <>
                          <div style={{ fontWeight: 600 }}>{st.location}</div>
                          {st.settlement_type && <div className="cell-sub">{st.settlement_type}</div>}
                        </>
                      ) : (
                        <span className="cell-muted">—</span>
                      )}
                    </td>
                    {/* Вчителю дії недоступні — порожня липка колонка лише закривала б розклад на телефоні */}
                    {canManage && (
                      <td className="sticky-r" onClick={(e) => e.stopPropagation()}>
                        <div className="row-actions">
                          <button className="row-btn" title="Редагувати" onClick={() => setEditing(st)}><IconPencil /></button>
                          <button className="row-btn danger" title="Видалити" onClick={() => setDeleting(st)}><IconTrash /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {students.error && (
              <div className="table-empty">
                <div className="big">{students.error instanceof ApiError && students.error.status === 403 ? "Немає доступу" : "Не вдалося завантажити дані"}</div>
                {students.error instanceof ApiError ? students.error.message : "Спробуйте оновити сторінку"}
              </div>
            )}
            {!students.isLoading && !students.error && filtered.length === 0 && (
              <div className="table-empty">
                <div className="big">{hasFilters ? "Нічого не знайдено" : "Учнів ще немає"}</div>
                {hasFilters ? "Спробуйте змінити пошук або фільтри" : "Додайте першого учня або імпортуйте з Excel"}
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
        <StudentFormModal
          student={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Видалити учня?</h3>
              <button className="close" aria-label="Закрити" onClick={() => setDeleting(null)}><IconClose /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
                <b>{studentFullName(deleting)}</b> буде видалено разом із записами на гуртки та
                історією відвідуваності. Цю дію не можна скасувати.
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

      {importOpen && (
        <div className="modal-overlay" onClick={() => setImportOpen(false)}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Імпорт учнів з Excel</h3>
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
              {importResult?.warnings && importResult.warnings.length > 0 && (
                <div className="form-warn" role="status">
                  {importResult.warnings.map((w) => <div key={w}>{w}</div>)}
                </div>
              )}
              <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 14 }}>
                Використовуйте <a className="link" href={studentsLinks.template}>шаблон Excel</a> —
                колонки мають збігатися з ним.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ fontSize: 13, fontFamily: "inherit" }}
              />
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
