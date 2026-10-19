import { type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { TopNav } from "../layout/TopNav";
import { dashboardQueries } from "../../features/dashboard/api";
import { ApiError, logout } from "../../lib/api";
import { IconClose, IconDownload } from "../../lib/icons";
import { useModalAccessibility } from "./useModalAccessibility";

interface PageShellProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}

/** Обліковка увійшла, але кабінет їй показати нічим.

    Єдиний реальний випадок — роль teacher без прив'язки до картки вчителя:
    /api/dashboard/summary відповідає 403, і сторінці нема з чого будувати
    навіть каркас. Раніше тут стояв редірект на /admin/, звідки гард повертав
    на /, і користувач залишався з порожнім білим екраном без пояснень і без
    можливості вийти. */
export function AccessProblem({ error }: { error: unknown }) {
  const reason =
    error instanceof ApiError && error.message
      ? error.message
      : "Кабінет недоступний для цього облікового запису.";

  async function onLogout() {
    await logout();
    window.location.assign("/login");
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Кабінет недоступний</h1>
        <p style={{ color: "var(--text-2)", margin: "10px 0 6px" }}>{reason}</p>
        <p style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 20 }}>
          Зверніться до адміністратора закладу — він прив'яже ваш обліковий запис
          до картки вчителя.
        </p>
        <button className="btn" onClick={onLogout}>Вийти</button>
      </div>
    </div>
  );
}

export function PageShell({ title, subtitle, actions, wide = true, children }: PageShellProps) {
  const summary = useQuery(dashboardQueries.summary());
  const s = summary.data;
  const counts = s
    ? {
        students: s.stats.students,
        teachers: s.stats.teachers,
        clubs: s.stats.clubs,
        active_schedules: s.stats.active_schedules,
      }
    : {};

  if (summary.error instanceof ApiError && summary.error.status === 401) {
    return <Navigate to="/login" replace />;
  }
  if (summary.error instanceof ApiError && summary.error.status === 403) {
    return <AccessProblem error={summary.error} />;
  }

  return (
    <>
      <TopNav counts={counts} user={s?.user} tenantName={s?.tenant.name} />
      <div className={`content${wide ? " wide" : ""}`}>
        <div className="page-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </div>
    </>
  );
}

export function DataToolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="table-card">
      <div className="table-empty">
        <div className="big">{title}</div>
        {children}
      </div>
    </div>
  );
}

/** Стан помилки запиту — окремо від порожнього стану (403 → немає доступу, решта → помилка + повтор).
 *  Рендерить лише `.table-empty` — кладеться всередину наявного `.table-card`. */
export function PageError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : undefined;
  const forbidden = status === 403;
  const title = forbidden ? "Немає доступу" : "Не вдалося завантажити дані";
  const message = forbidden
    ? "У вашого акаунта немає прав переглядати цей розділ."
    : error instanceof ApiError ? error.message : "Сталася помилка. Спробуйте ще раз.";
  return (
    <div className="table-empty">
      <div className="big">{title}</div>
      <p>{message}</p>
      {onRetry && !forbidden && (
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={onRetry}>Спробувати ще</button>
      )}
    </div>
  );
}

export function DataTable({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="table-card">
      <div className="table-scroll">
        <table className="dtable">{children}</table>
      </div>
      {footer && <div className="table-foot">{footer}</div>}
    </div>
  );
}

export function StatusTag({
  tone = "neutral",
  children,
}: {
  tone?: "create" | "update" | "enroll" | "delete" | "neutral";
  children: ReactNode;
}) {
  return <span className={`tag${tone === "neutral" ? "" : ` ${tone}`}`}>{children}</span>;
}

export function FormModal({
  title,
  children,
  submitLabel,
  pending = false,
  submitDisabled = false,
  submitVisible = true,
  cancelLabel = "Скасувати",
  error,
  onSubmit,
  onClose,
}: {
  title: string;
  children: ReactNode;
  submitLabel: string;
  pending?: boolean;
  submitDisabled?: boolean;
  submitVisible?: boolean;
  cancelLabel?: string;
  /** Помилка показується у вікні, а не на сторінці за ним. */
  error?: string | null;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}) {
  const { dialogRef, titleId } = useModalAccessibility<HTMLFormElement>(onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <form ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error" role="alert">{error}</div>}
          {children}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>{cancelLabel}</button>
          {submitVisible && (
            <button type="submit" className="btn" disabled={pending || submitDisabled}>
              {pending ? "Зберігаємо…" : submitLabel}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel = "Підтвердити",
  pending = false,
  danger = true,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  danger?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { dialogRef, titleId } = useModalAccessibility<HTMLDivElement>(onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={dialogRef} className="modal-card narrow" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error" role="alert">{error}</div>}
          {children}
        </div>
        <div className="modal-foot">
          <button className="btn secondary" onClick={onClose}>Скасувати</button>
          <button className={`btn${danger ? " danger" : ""}`} disabled={pending} onClick={onConfirm}>
            {pending ? "Виконуємо…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, idx) => idx + 1);
  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>←</button>
      {pages.slice(Math.max(0, page - 3), Math.min(totalPages, page + 2)).map((p) => (
        <button key={p} className={p === page ? "on" : ""} onClick={() => onPage(p)}>
          {p}
        </button>
      ))}
      <button disabled={page >= totalPages} onClick={() => onPage(page + 1)}>→</button>
    </div>
  );
}

/** Посилання «Експорт». Вимикається, коли експортувати нічого:
 *  бекенд у такому разі віддає 404, а браузер показав би сирий JSON. */
export function ExportLink({ href, disabled }: { href: string; disabled: boolean }) {
  return (
    <a
      className={`btn ghost${disabled ? " disabled" : ""}`}
      href={disabled ? undefined : href}
      aria-disabled={disabled}
      title={disabled ? "Поки нема чого експортувати" : undefined}
      onClick={(e) => { if (disabled) e.preventDefault(); }}
    >
      <IconDownload />Експорт
    </a>
  );
}

/* ── Роль поточного користувача ──────────────────────────────────────────── */

export type UserRole = "owner" | "admin" | "teacher";

/** Роль із summary. undefined, доки дані не приїхали. */
export function useCurrentRole(): UserRole | undefined {
  const summary = useQuery(dashboardQueries.summary());
  return summary.data?.user.role as UserRole | undefined;
}

/** Чи має користувач право створювати, редагувати й видаляти.
 *  Вчитель бачить свої дані, але не керує закладом. */
export function useCanManage(): boolean {
  const role = useCurrentRole();
  return role === "owner" || role === "admin";
}
