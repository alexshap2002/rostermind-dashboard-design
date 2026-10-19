import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AccessProblem } from "../../components/admin/primitives";
import { ApiError, logout } from "../../lib/api";
import { IconLogout } from "../../lib/icons";
import { platformQueries } from "./api";

/** Кабінет платформи — лише для super_admin. Справжній захист — `SuperAdminUser` на бекенді;
    тут — щоб школа, яка відкрила `/platform`, потрапила до себе, а не на порожній каркас. */
export function PlatformOnly({ children }: { children: ReactNode }) {
  const session = useQuery(platformQueries.session());
  if (session.error instanceof ApiError && session.error.status === 401) return <Navigate to="/login" replace />;
  if (session.error) return <AccessProblem error={session.error} />;
  if (!session.data) return null;
  if (session.data.role !== "super_admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function PlatformShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const onLogout = async () => {
    await logout();
    window.location.assign("/login");
  };
  const schools = pathname === "/platform" || pathname.startsWith("/platform/schools");

  return (
    <>
      <nav className="topnav pf-top">
        <Link className="pf-brand" to="/platform">
          RosterMind <span className="pf-badge">Платформа</span>
        </Link>
        <div className="pf-nav">
          <Link className={schools ? "active" : ""} to="/platform">Заклади</Link>
          <Link className={pathname.startsWith("/platform/activity") ? "active" : ""} to="/platform/activity">Останні дії</Link>
          <Link className={pathname.startsWith("/platform/security") ? "active" : ""} to="/platform/security">Безпека</Link>
        </div>
        <div className="topnav-right">
          <button type="button" className="icon-btn pf-logout" aria-label="Вийти" title="Вийти" onClick={onLogout}>
            <IconLogout />
          </button>
        </div>
      </nav>
      <div className="content wide">
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
