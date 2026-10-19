import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { formatDateUk, formatNumber } from "../../lib/format";
import { IconClose, IconPlus, IconSearch } from "../../lib/icons";
import { TopNav } from "../../components/layout/TopNav";
import { ExportLink, useCanManage } from "../../components/admin/primitives";
import { useScrollShades } from "../../components/admin/useScrollShades";
import { dashboardQueries } from "../dashboard/api";
import type { Club } from "../students/types";
import { clubsApi, clubsLinks, clubsQueries, type ClubImportResult, type ClubInput } from "./api";

type SortKey = "name" | "duration" | "location" | "students" | "schedules" | "created_at";

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

// Бекенд кодує weekday 1–7 (1 = Понеділок), див. app/models/schedule.py
const WEEKDAYS: Record<number, string> = {
  1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб", 7: "Нд",
};

function ClubFormModal({ club, onClose }: { club: Club | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(club?.name ?? "");
  const [duration, setDuration] = useState(club ? String(club.duration_min) : "60");
  const [location, setLocation] = useState(club?.location ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload: ClubInput = {
        name: name.trim(),
        duration_min: Number(duration),
        location: location.trim(),
      };
      return club ? clubsApi.update(club.id, payload) : clubsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clubs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Не вдалося зберегти. Спробуйте ще раз."),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Назва — обов'язкове поле");
    if (!location.trim()) return setError("Локація — обов'язкове поле");
    const d = Number(duration);
    if (!Number.isFinite(d) || d < 10 || d > 480) return setError("Тривалість: від 10 до 480 хвилин");
    save.mutate();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card narrow" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="modal-head">
          <h3>{club ? "Редагувати гурток" : "Створити гурток"}</h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}
          <div className="fgrid">
            <div className="field span-12">
              <label htmlFor="c-name">Назва гуртка *</label>
              <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Робототехніка" required autoFocus />
            </div>
            <div className="field span-6">
              <label htmlFor="c-duration">Тривалість, хв *</label>
              <input id="c-duration" type="number" min="10" max="480" step="5" value={duration} onChange={(e) => setDuration(e.target.value)} required />
            </div>
            <div className="field span-6">
              <label htmlFor="c-location">Локація *</label>
              <input id="c-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="каб. 12 / вул. Шкільна 5" required />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="btn" disabled={save.isPending}>
            {save.isPending ? "Зберігаємо…" : club ? "Зберегти зміни" : "Створити гурток"}
          </button>
        </div>
      </form>
    </div>
  );
}

const PAGE_SIZE = 25;

export function ClubsPage() {
  const canManage = useCanManage();
  const qc = useQueryClient();
  const summary = useQuery(dashboardQueries.summary());
  const clubs = useQuery(clubsQueries.list());
  const enrollments = useQuery(clubsQueries.enrollments());
  const schedules = useQuery(clubsQueries.schedules());

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<Club | null | "new">(null);

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
  const [deleting, setDeleting] = useState<Club | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<ClubImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
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

  // Кількість записаних учнів на гурток
  const studentsByClub = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of enrollments.data ?? []) {
      map.set(e.club_id, (map.get(e.club_id) ?? 0) + 1);
    }
    return map;
  }, [enrollments.data]);

  // Активні розклади гуртка: кількість, дні тижня, вчителі
  const schedulesByClub = useMemo(() => {
    const map = new Map<number, { count: number; days: Set<number>; teachers: Set<string> }>();
    for (const sch of schedules.data ?? []) {
      if (!sch.active) continue;
      const entry = map.get(sch.club_id) ?? { count: 0, days: new Set(), teachers: new Set() };
      entry.count += 1;
      entry.days.add(sch.weekday);
      if (sch.teacher_name) entry.teachers.add(sch.teacher_name);
      for (const t of sch.teachers ?? []) if (t.teacher_name) entry.teachers.add(t.teacher_name);
      map.set(sch.club_id, entry);
    }
    return map;
  }, [schedules.data]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const c of clubs.data ?? []) if (c.location) set.add(c.location);
    return [...set].sort((a, b) => a.localeCompare(b, "uk"));
  }, [clubs.data]);

  const filtered = useMemo(() => {
    let list = clubs.data ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.location.toLowerCase().includes(q),
      );
    }
    if (locationFilter) list = list.filter((c) => c.location === locationFilter);

    const dir = sortDir;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "name": return dir * a.name.localeCompare(b.name, "uk");
        case "duration": return dir * (a.duration_min - b.duration_min);
        case "location": return dir * a.location.localeCompare(b.location, "uk");
        case "students": return dir * ((studentsByClub.get(a.id) ?? 0) - (studentsByClub.get(b.id) ?? 0));
        case "schedules": return dir * ((schedulesByClub.get(a.id)?.count ?? 0) - (schedulesByClub.get(b.id)?.count ?? 0));
        case "created_at": return dir * a.created_at.localeCompare(b.created_at);
        default: return 0;
      }
    });
  }, [clubs.data, search, locationFilter, sortKey, sortDir, studentsByClub, schedulesByClub]);

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
    mutationFn: (id: number) => clubsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clubs"] });
      qc.invalidateQueries({ queryKey: ["enrollments"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleting(null);
    },
  });

  const importMut = useMutation({
    mutationFn: (file: File) => clubsApi.importExcel(file),
    onSuccess: (res) => {
      setImportError(null);
      setImportResult(res);
      qc.invalidateQueries({ queryKey: ["clubs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => {
      setImportResult(null);
      setImportError(err instanceof ApiError ? err.message : "Не вдалося імпортувати файл");
    },
  });

  const hasFilters = search || locationFilter;

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
            <h2>Уроки · гуртки</h2>
            <p>{clubs.data ? `${formatNumber(clubs.data.length)} гуртків` : "Завантаження…"}</p>
          </div>
        </div>

        <div className="toolbar">
          <div className="tsearch">
            <IconSearch />
            <input
              placeholder="Пошук: назва, локація…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select className="tselect" value={locationFilter} onChange={(e) => { setLocationFilter(e.target.value); setPage(1); }}>
            <option value="">Локація: всі</option>
            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {hasFilters && (
            <button className="btn ghost" onClick={() => { setSearch(""); setLocationFilter(""); setPage(1); }}>
              Скинути
            </button>
          )}
          <span className="spacer" />
          {canManage && (
            <>
              <a className="btn ghost" href={clubsLinks.template}><IconDownload />Шаблон</a>
              <button className="btn ghost" onClick={() => { setImportResult(null); setImportError(null); setImportOpen(true); }}>
                <IconUpload />Імпорт
              </button>
            </>
          )}
          {canManage && <ExportLink href={clubsLinks.exportExcel} disabled={(clubs.data ?? []).length === 0} />}
          {canManage && (
            <button className="btn" onClick={() => setEditing("new")}><IconPlus /><span>Створити гурток</span></button>
          )}
        </div>

        <div className="table-card">
          <div className="table-scroll" ref={scrollRef}>
            <table className="dtable" style={{ minWidth: 1080 }}>
              <thead>
                <tr>
                  <th className="sortable sticky-l" onClick={() => toggleSort("name")} style={{ minWidth: 200 }}>Назва {arrow("name")}</th>
                  <th className="sortable" onClick={() => toggleSort("duration")}>Тривалість {arrow("duration")}</th>
                  <th className="sortable" onClick={() => toggleSort("location")}>Локація {arrow("location")}</th>
                  <th className="sortable" onClick={() => toggleSort("students")}>Учнів записано {arrow("students")}</th>
                  <th className="sortable" onClick={() => toggleSort("schedules")} style={{ minWidth: 160 }}>Розклад {arrow("schedules")}</th>
                  <th style={{ minWidth: 180 }}>Вчителі</th>
                  <th className="sortable" onClick={() => toggleSort("created_at")}>Створено {arrow("created_at")}</th>
                  <th className="sticky-r" />
                </tr>
              </thead>
              <tbody>
                {clubs.isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j}><span className="sk" style={{ display: "block", height: 14 }} /></td>
                      ))}
                    </tr>
                  ))}
                {pageRows.map((c) => {
                  const studentCount = studentsByClub.get(c.id) ?? 0;
                  const sch = schedulesByClub.get(c.id);
                  const days = sch
                    ? [...sch.days].sort((a, b) => a - b).map((d) => WEEKDAYS[d] ?? String(d)).join(", ")
                    : "";
                  const teacherNames = sch ? [...sch.teachers].sort((a, b) => a.localeCompare(b, "uk")) : [];
                  return (
                    <tr key={c.id} onClick={() => setEditing(c)}>
                      <td className="sticky-l"><div className="cell-name">{c.name}</div></td>
                      <td className="tnum-cell">{c.duration_min} хв</td>
                      <td>{c.location || <span className="cell-muted">—</span>}</td>
                      <td className="tnum-cell">
                        {studentCount > 0 ? (
                          <b>{formatNumber(studentCount)}</b>
                        ) : (
                          <span className="cell-muted">0</span>
                        )}
                      </td>
                      <td>
                        {sch ? (
                          <>
                            <div style={{ fontWeight: 600 }}>{sch.count} {sch.count === 1 ? "заняття" : "занять"}/тижд.</div>
                            <div className="cell-sub">{days}</div>
                          </>
                        ) : (
                          <span className="cell-muted">немає в розкладі</span>
                        )}
                      </td>
                      <td>
                        {teacherNames.length ? (
                          <ul className="vlist olive">
                            {teacherNames.map((n) => <li key={n}>{n}</li>)}
                          </ul>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </td>
                      <td className="tnum-cell cell-muted">{formatDateUk(c.created_at.slice(0, 10))}</td>
                      <td className="sticky-r" onClick={(e) => e.stopPropagation()}>
                        {canManage && (
                        <div className="row-actions">
                          <button className="row-btn" title="Редагувати" onClick={() => setEditing(c)}><IconPencil /></button>
                          <button className="row-btn danger" title="Видалити" onClick={() => setDeleting(c)}><IconTrash /></button>
                        </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {clubs.error && (
              <div className="table-empty">
                <div className="big">{clubs.error instanceof ApiError && clubs.error.status === 403 ? "Немає доступу" : "Не вдалося завантажити дані"}</div>
                {clubs.error instanceof ApiError ? clubs.error.message : "Спробуйте оновити сторінку"}
              </div>
            )}
            {!clubs.isLoading && !clubs.error && filtered.length === 0 && (
              <div className="table-empty">
                <div className="big">{hasFilters ? "Нічого не знайдено" : "Гуртків ще немає"}</div>
                {hasFilters ? "Спробуйте змінити пошук або фільтри" : "Створіть перший гурток"}
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
        <ClubFormModal club={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}

      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Видалити гурток?</h3>
              <button className="close" aria-label="Закрити" onClick={() => setDeleting(null)}><IconClose /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
                <b>{deleting.name}</b> буде видалено разом із розкладами, записами учнів
                ({formatNumber(studentsByClub.get(deleting.id) ?? 0)}) та історією занять.
                Цю дію не можна скасувати.
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
              <h3>Імпорт гуртків з Excel</h3>
              <button className="close" aria-label="Закрити" onClick={() => setImportOpen(false)}><IconClose /></button>
            </div>
            <div className="modal-body">
              {importError && <div className="form-error">{importError}</div>}
              {importResult && (
                <div className="form-ok">
                  Створено: {importResult.created_count}, пропущено: {importResult.skipped_count}.
                  {importResult.errors.slice(0, 5).map((er) => <div key={er}>{er}</div>)}
                </div>
              )}
              <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 14 }}>
                Використовуйте <a className="link" href={clubsLinks.template}>шаблон Excel</a> —
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
