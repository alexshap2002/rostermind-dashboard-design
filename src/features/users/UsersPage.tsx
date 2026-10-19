import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { formatNumber, roleLabel } from "../../lib/format";
import { IconClose, IconPencil, IconPlus, IconSearch, IconTrash } from "../../lib/icons";
import { TopNav } from "../../components/layout/TopNav";
import { ExportLink } from "../../components/admin/primitives";
import { useScrollShades } from "../../components/admin/useScrollShades";
import { dashboardQueries } from "../dashboard/api";
import { teachersQueries } from "../teachers/api";
import { usersApi, usersLinks, usersQueries, type UserAccount, type UserRole } from "./api";

function roleTagClass(role: string): string {
  if (role === "owner" || role === "super_admin") return "delete";
  if (role === "admin") return "update";
  return "create";
}

function UserForm({ user, onClose }: { user: UserAccount | null; onClose: () => void }) {
  const qc = useQueryClient();
  const teachers = useQuery(teachersQueries.list());
  const [email, setEmail] = useState(user?.login ?? "");
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(user?.role === "super_admin" ? "admin" : user?.role ?? "admin");
  const [teacherId, setTeacherId] = useState(user?.teacher_id ? String(user.teacher_id) : "");
  const [active, setActive] = useState(user?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);

  // Захист власника (як у legacy): роль/статус власника не змінюються, «власник» не пропонується для інших
  const isOwner = user?.role === "owner" || user?.role === "super_admin";
  const roleOptions: UserRole[] = isOwner ? ["owner", "admin", "teacher"] : ["admin", "teacher"];

  const save = useMutation({
    mutationFn: () => {
      const teacher_id = role === "teacher" && teacherId ? Number(teacherId) : null;
      if (user) {
        return usersApi.update(user.id, {
          email, full_name: fullName, teacher_id,
          // Роль і активність власника не змінюються — бекенд їх для власника не приймає.
          ...(isOwner ? {} : { role, is_active: active }),
          ...(password ? { password } : {}),
        });
      }
      return usersApi.create({ email, full_name: fullName, password, role, teacher_id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Не вдалося зберегти користувача"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError("Вкажіть логін/email");
    if (!fullName.trim()) return setError("Вкажіть ПІБ");
    if (!user && password.length < 4) return setError("Пароль має бути не коротше 4 символів");
    if (role === "teacher" && !teacherId) return setError("Для ролі вчителя оберіть прив'язку до вчителя");
    save.mutate();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card narrow" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="modal-head">
          <h3>{user ? "Редагувати користувача" : "Додати користувача"}</h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}
          <div className="fgrid">
            <div className="field span-6">
              <label htmlFor="user-email">Логін / email *</label>
              <input id="user-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field span-6">
              <label htmlFor="user-name">ПІБ *</label>
              <input id="user-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="field span-6">
              <label htmlFor="user-role">Роль *</label>
              <select
                id="user-role"
                value={role}
                disabled={isOwner}
                onChange={(e) => {
                  const next = e.target.value as UserRole;
                  setRole(next);
                  if (next !== "teacher") setTeacherId("");
                }}
              >
                {roleOptions.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </div>
            <div className="field span-6">
              <label htmlFor="user-password">{user ? "Новий пароль" : "Пароль *"}</label>
              <input
                id="user-password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={user ? "залиште порожнім без змін" : ""}
              />
            </div>
            {role === "teacher" && (
              <div className="field span-12">
                <label htmlFor="user-teacher">Прив'язка до вчителя *</label>
                <select id="user-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                  <option value="">Оберіть вчителя…</option>
                  {(teachers.data ?? [])
                    .filter((t) => t.active || String(t.id) === teacherId)
                    .map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
            )}
            {user && (
              <div className="field span-12">
                <label className={`check${active ? " on" : ""}${isOwner ? " disabled" : ""}`}>
                  <input type="checkbox" checked={active} disabled={isOwner} onChange={() => setActive((v) => !v)} />
                  Активний користувач{isOwner ? " (власника не можна деактивувати)" : ""}
                </label>
              </div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="btn" disabled={save.isPending}>
            {save.isPending ? "Зберігаємо…" : user ? "Зберегти зміни" : "Додати користувача"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function UsersPage() {
  const qc = useQueryClient();
  const summary = useQuery(dashboardQueries.summary());
  const users = useQuery(usersQueries.list());
  const teachers = useQuery(teachersQueries.list());
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [editing, setEditing] = useState<UserAccount | null | "new">(null);
  const [deleting, setDeleting] = useState<UserAccount | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const scrollRef = useScrollShades<HTMLDivElement>();

  // «Додати адміністратора» з «Філій й оплати» веде сюди з ?new=1 — одразу відкриваємо форму
  // (роль «Адміністратор» у ній за замовчуванням). Параметр разовий — прибираємо з адреси.
  const [urlParams, setUrlParams] = useSearchParams();
  useEffect(() => {
    if (urlParams.get("new") === null) return;
    setEditing("new");
    setUrlParams({}, { replace: true });
  }, [urlParams, setUrlParams]);

  const teachersById = useMemo(
    () => new Map((teachers.data ?? []).map((t) => [t.id, t.full_name])),
    [teachers.data],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users.data ?? []).filter((user) => {
      if (q && ![user.login, user.full_name, roleLabel(user.role), teachersById.get(user.teacher_id ?? -1)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))) return false;
      if (roleFilter && user.role !== roleFilter) return false;
      if (statusFilter === "active" && !user.is_active) return false;
      if (statusFilter === "inactive" && user.is_active) return false;
      return true;
    });
  }, [users.data, search, roleFilter, statusFilter, teachersById]);

  const activeCount = (users.data ?? []).filter((u) => u.is_active).length;
  const ownerCount = (users.data ?? []).filter((u) => u.role === "owner").length;
  const hasFilters = search || roleFilter || statusFilter !== "active";

  const s = summary.data;
  const counts = s
    ? { students: s.stats.students, teachers: s.stats.teachers, clubs: s.stats.clubs, active_schedules: s.stats.active_schedules }
    : {};

  const remove = useMutation({
    mutationFn: (id: number) => usersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleting(null);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Не вдалося видалити користувача"),
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
            <h2>Користувачі</h2>
            <p>
              {users.data
                ? `${formatNumber(users.data.length)} облікових записів · активних ${formatNumber(activeCount)}`
                : "Завантаження…"}
            </p>
          </div>
          <button className="btn" onClick={() => setEditing("new")}><IconPlus /><span>Додати користувача</span></button>
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
            <input placeholder="Пошук: логін, ПІБ, роль…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="tselect" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">Роль: всі</option>
            <option value="owner">{roleLabel("owner")}</option>
            <option value="admin">{roleLabel("admin")}</option>
            <option value="teacher">{roleLabel("teacher")}</option>
          </select>
          <select className="tselect" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="active">Активні</option>
            <option value="all">Всі</option>
            <option value="inactive">Неактивні</option>
          </select>
          {hasFilters && (
            <button className="btn ghost" onClick={() => { setSearch(""); setRoleFilter(""); setStatusFilter("active"); }}>Скинути</button>
          )}
          <span className="spacer" />
          <ExportLink href={usersLinks.exportExcel} disabled={(users.data ?? []).length === 0} />
        </div>

        <div className="metric-strip">
          <div><b>{formatNumber(activeCount)}</b><span>активні</span></div>
          <div><b>{formatNumber(ownerCount)}</b><span>власники</span></div>
          <div><b>{formatNumber((users.data ?? []).length - activeCount)}</b><span>деактивовані</span></div>
        </div>

        <div className="table-card">
          <div className="table-scroll" ref={scrollRef}>
            <table className="dtable" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th className="sticky-l" style={{ minWidth: 200 }}>Користувач</th>
                  <th>Роль</th>
                  <th style={{ minWidth: 160 }}>Вчитель</th>
                  <th>Статус</th>
                  <th className="sticky-r" />
                </tr>
              </thead>
              <tbody>
                {users.isLoading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 5 }).map((__, j) => (
                      <td key={j}><span className="sk" style={{ display: "block", height: 14 }} /></td>
                    ))}</tr>
                  ))}
                {filtered.map((user) => (
                  <tr key={user.id} onClick={() => setEditing(user)} style={user.is_active ? undefined : { opacity: 0.6 }}>
                    <td className="sticky-l">
                      <div className="cell-name">{user.full_name}</div>
                      <div className="cell-sub">{user.login}</div>
                    </td>
                    <td><span className={`tag ${roleTagClass(user.role)}`}>{roleLabel(user.role)}</span></td>
                    <td>{user.teacher_id ? (teachersById.get(user.teacher_id) ?? `ID ${user.teacher_id}`) : <span className="cell-muted">—</span>}</td>
                    <td><span className={`tag ${user.is_active ? "create" : ""}`}>{user.is_active ? "Активний" : "Вимкнено"}</span></td>
                    <td className="sticky-r" onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <button className="row-btn" title="Редагувати" onClick={() => setEditing(user)}><IconPencil /></button>
                        {user.role === "owner"
                          ? <button className="row-btn" title="Акаунт власника захищений і не може бути видалений" disabled><IconTrash /></button>
                          : <button className="row-btn danger" title="Видалити" onClick={() => setDeleting(user)}><IconTrash /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.error && (
              <div className="table-empty">
                <div className="big">{users.error instanceof ApiError && users.error.status === 403 ? "Немає доступу" : "Не вдалося завантажити дані"}</div>
                {users.error instanceof ApiError ? users.error.message : "Спробуйте оновити сторінку"}
              </div>
            )}
            {!users.isLoading && !users.error && filtered.length === 0 && (
              <div className="table-empty">
                <div className="big">{hasFilters ? "Нічого не знайдено" : "Користувачів ще немає"}</div>
                {hasFilters ? "Змініть фільтри або пошук" : "Додайте першого користувача"}
              </div>
            )}
          </div>
          <div className="table-foot">
            <span>Показано {formatNumber(filtered.length)} із {formatNumber((users.data ?? []).length)}</span>
          </div>
        </div>
      </div>

      {editing !== null && <UserForm user={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Видалити користувача?</h3>
              <button className="close" aria-label="Закрити" onClick={() => setDeleting(null)}><IconClose /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
                <b>{deleting.full_name}</b> ({deleting.login}) буде видалений. Для тимчасового блокування
                краще вимкнути статус у формі редагування.
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
