import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AccessProblem, useCurrentRole } from "../components/admin/primitives";
import { ApiError, getCurrentSession } from "../lib/api";
import { dashboardQueries } from "../features/dashboard/api";
import { DEMO } from "../demo/mockApi";
import { DemoStub } from "../demo/DemoStub";

const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const TeacherDashboardPage = lazy(() => import("../features/dashboard/TeacherDashboardPage").then((m) => ({ default: m.TeacherDashboardPage })));
const MyNotificationsPage = lazy(() => import("../features/teacherNotifications/MyNotificationsPage").then((m) => ({ default: m.MyNotificationsPage })));
const LoginPage = lazy(() => import("../features/auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const BillingRecoveryPage = lazy(() => import("../features/auth/BillingRecoveryPage").then((m) => ({ default: m.BillingRecoveryPage })));
const StudentsPage = lazy(() => import("../features/students/StudentsPage").then((m) => ({ default: m.StudentsPage })));
const TeachersPage = lazy(() => import("../features/teachers/TeachersPage").then((m) => ({ default: m.TeachersPage })));
const ClubsPage = lazy(() => import("../features/clubs/ClubsPage").then((m) => ({ default: m.ClubsPage })));
const SchedulesPage = lazy(() => import("../features/schedules/SchedulesPage").then((m) => ({ default: m.SchedulesPage })));
const ConductedLessonsPage = lazy(() => import("../features/conductedLessons/ConductedLessonsPage").then((m) => ({ default: m.ConductedLessonsPage })));
const PayRatesPage = lazy(() => import("../features/payRates/PayRatesPage").then((m) => ({ default: m.PayRatesPage })));
const PayrollPage = lazy(() => import("../features/payroll/PayrollPage").then((m) => ({ default: m.PayrollPage })));
const AuditPage = lazy(() => import("../features/audit/AuditPage").then((m) => ({ default: m.AuditPage })));
const UsersPage = lazy(() => import("../features/users/UsersPage").then((m) => ({ default: m.UsersPage })));
const BotPage = lazy(() => import("../features/bot/BotPage").then((m) => ({ default: m.BotPage })));
const CalendarPage = lazy(() => import("../features/calendar/CalendarPage").then((m) => ({ default: m.CalendarPage })));
const TeacherNotificationsPage = lazy(() => import("../features/teacherNotifications/TeacherNotificationsPage").then((m) => ({ default: m.TeacherNotificationsPage })));
const AdminTelegramPage = lazy(() => import("../features/adminTelegram/AdminTelegramPage").then((m) => ({ default: m.AdminTelegramPage })));
const StatisticsPage = lazy(() => import("../features/statistics/StatisticsPage").then((m) => ({ default: m.StatisticsPage })));
const LessonStatisticsPage = lazy(() => import("../features/lessonStatistics/LessonStatisticsPage").then((m) => ({ default: m.LessonStatisticsPage })));
const ArchivePage = lazy(() => import("../features/archive/ArchivePage").then((m) => ({ default: m.ArchivePage })));
const RegistrationPage = lazy(() => import("../features/registration/RegistrationPage").then((m) => ({ default: m.RegistrationPage })));
const BranchesPage = lazy(() => import("../features/branches/BranchesPage").then((m) => ({ default: m.BranchesPage })));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const AiAccessPage = lazy(() => import("../features/aiAccess/AiAccessPage").then((m) => ({ default: m.AiAccessPage })));
const MainBranchPage = lazy(() => import("../features/mainBranch/MainBranchPage").then((m) => ({ default: m.MainBranchPage })));
const NotFoundPage = lazy(() => import("../features/misc/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));
// Кабінет платформи (super_admin) — окремі чанки, школи їх не вантажать.
const PlatformOnly = lazy(() => import("../features/platform/PlatformShell").then((m) => ({ default: m.PlatformOnly })));
const SchoolsPage = lazy(() => import("../features/platform/SchoolsPage").then((m) => ({ default: m.SchoolsPage })));
const SchoolPage = lazy(() => import("../features/platform/SchoolPage").then((m) => ({ default: m.SchoolPage })));
const PlatformActivityPage = lazy(() => import("../features/platform/ActivityPage").then((m) => ({ default: m.ActivityPage })));
const PlatformSecurityPage = lazy(() => import("../features/platform/SecurityPage").then((m) => ({ default: m.SecurityPage })));

/** Спільний гард кабінету для всіх сторінок після входу.

    Сторінки по-різному будують каркас: одні через PageShell, інші малюють
    TopNav самі. Тому 403 на /api/dashboard/summary не можна обробляти в
    PageShell — половина сторінок його не використовує, і обліковка без
    прив'язки до картки вчителя лишалася з чужим меню й порожнім екраном. */
function CabinetGuard({ children }: { children: ReactNode }) {
  const summary = useQuery(dashboardQueries.summary());

  if (summary.error instanceof ApiError && summary.error.status === 401) {
    return <Navigate to="/login" replace />;
  }
  if (summary.error instanceof ApiError && summary.error.status === 403) {
    return <SuperAdminToPlatform error={summary.error} />;
  }
  return <>{children}</>;
}

/** super_admin не має закладу: кабінет школи віддає йому 403 — ведемо в кабінет платформи. */
function SuperAdminToPlatform({ error }: { error: ApiError }) {
  const session = useQuery({ queryKey: ["platform", "session"], queryFn: getCurrentSession, retry: false });
  if (session.data?.role === "super_admin") return <Navigate to="/platform" replace />;
  if (session.isPending) return null;
  return <AccessProblem error={error} />;
}

/** Головна різна для власника й вчителя, тож обираємо за роллю з summary. */
function HomeByRole() {
  const role = useCurrentRole();
  if (role === undefined) return null; // чекаємо summary; далі сторінка сама покаже каркас
  return role === "teacher" ? <TeacherDashboardPage /> : <DashboardPage />;
}

/** Екрани лише для власника (в меню позначені ownerOnly).

    Меню їх адміністратору не показує, але URL відкривався, і він бачив
    порожній каркас із 403 замість пояснення. */
function OwnerOnly({ children }: { children: ReactNode }) {
  const role = useCurrentRole();
  if (role === undefined) return null; // роль ще не приїхала — не блимаємо редіректом
  if (role !== "owner") return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Адмінські екрани: вчителю там нічого робити, API все одно віддасть 403. */
function AdminOnly({ children }: { children: ReactNode }) {
  const role = useCurrentRole();
  if (role === undefined) return null; // роль ще не приїхала — не блимаємо редіректом
  if (role === "teacher") return <Navigate to="/" replace />;
  return <>{children}</>;
}

const LOADING = <div className="login-wrap"><div className="login-card">Завантаження…</div></div>;

/** Сторінки до входу: гард кабінету до них не застосовується. */
function publicRoute(element: ReactNode) {
  return <Suspense fallback={LOADING}>{element}</Suspense>;
}

/** Кабінет платформи: без гарда школи (super_admin там отримує 403), зі своїм гардом ролі. */
function platformRoute(element: ReactNode) {
  return (
    <Suspense fallback={LOADING}>
      <PlatformOnly>{element}</PlatformOnly>
    </Suspense>
  );
}

function route(element: ReactNode) {
  return (
    <Suspense fallback={LOADING}>
      <CabinetGuard>{element}</CabinetGuard>
    </Suspense>
  );
}

export const router = createBrowserRouter(DEMO ? [
  { path: "/", element: <Navigate to="/main-branch" replace /> },
  { path: "/login", element: <Navigate to="/main-branch" replace /> },
  { path: "/main-branch", element: route(<MainBranchPage />) },
  { path: "*", element: route(<DemoStub />) },
] : [
  { path: "/login", element: publicRoute(<LoginPage />) },
  { path: "/billing-recovery", element: publicRoute(<BillingRecoveryPage />) },
  { path: "/", element: route(<HomeByRole />) },
  { path: "/students", element: route(<StudentsPage />) },
  { path: "/teachers", element: route(<AdminOnly><TeachersPage /></AdminOnly>) },
  { path: "/clubs", element: route(<ClubsPage />) },
  { path: "/schedules", element: route(<SchedulesPage />) },
  { path: "/conducted-lessons", element: route(<ConductedLessonsPage />) },
  { path: "/pay-rates", element: route(<AdminOnly><PayRatesPage /></AdminOnly>) },
  { path: "/payroll", element: route(<PayrollPage />) },
  { path: "/audit", element: route(<AdminOnly><AuditPage /></AdminOnly>) },
  { path: "/users", element: route(<OwnerOnly><UsersPage /></OwnerOnly>) },
  { path: "/bot", element: route(<AdminOnly><BotPage /></AdminOnly>) },
  { path: "/calendar", element: route(<CalendarPage />) },
  { path: "/teacher-notifications", element: route(<AdminOnly><TeacherNotificationsPage /></AdminOnly>) },
  { path: "/my-notifications", element: route(<MyNotificationsPage />) },
  { path: "/telegram-notifications", element: route(<AdminOnly><AdminTelegramPage /></AdminOnly>) },
  { path: "/statistics", element: route(<AdminOnly><StatisticsPage /></AdminOnly>) },
  { path: "/lesson-statistics", element: route(<AdminOnly><LessonStatisticsPage /></AdminOnly>) },
  { path: "/archive", element: route(<OwnerOnly><ArchivePage /></OwnerOnly>) },
  { path: "/registration", element: route(<AdminOnly><RegistrationPage /></AdminOnly>) },
  { path: "/branches", element: route(<OwnerOnly><BranchesPage /></OwnerOnly>) },
  { path: "/main-branch", element: route(<AdminOnly><MainBranchPage /></AdminOnly>) },
  { path: "/ai-access", element: route(<AdminOnly><AiAccessPage /></AdminOnly>) },
  { path: "/settings", element: route(<AdminOnly><SettingsPage /></AdminOnly>) },
  { path: "/platform", element: platformRoute(<SchoolsPage />) },
  { path: "/platform/schools/:tenantId", element: platformRoute(<SchoolPage />) },
  { path: "/platform/activity", element: platformRoute(<PlatformActivityPage />) },
  { path: "/platform/security", element: platformRoute(<PlatformSecurityPage />) },
  { path: "*", element: route(<NotFoundPage />) },
]);
