import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { formatCurrency, formatUpdatedAt, pluralUk } from "../../lib/format";
import { TopNav } from "../../components/layout/TopNav";
import {
  KPI_PRESETS, KpiTile, Sk, TodaySchedule,
} from "../../components/dashboard/tiles";
import { dashboardQueries } from "./api";

/** Сума нарахувань за поточний місяць із помісячного ряду. */
function currentMonthPayroll(months: { month: string; total: number }[]): number | null {
  if (!months.length) return null;
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return months.find((m) => m.month === key)?.total ?? 0;
}

/** Дашборд вчителя: лише його власні показники й уроки на сьогодні. */
export function TeacherDashboardPage() {
  const summary = useQuery(dashboardQueries.summary());
  const today = useQuery(dashboardQueries.todayEvents());

  const s = summary.data;

  if (summary.error instanceof ApiError && summary.error.status === 401) {
    return <Navigate to="/login" replace />;
  }

  const counts = s
    ? {
        students: s.stats.students,
        teachers: s.stats.teachers,
        clubs: s.stats.clubs,
        active_schedules: s.stats.active_schedules,
      }
    : {};

  const monthPayroll = s ? currentMonthPayroll(s.payroll_by_month) : null;
  const todayEvents = today.data ?? [];

  return (
    <>
      <TopNav counts={counts} user={s?.user} tenantName={s?.tenant.name} />

      <div className="content">
        <div className="page-head">
          <div>
            <h2>Мій кабінет</h2>
            <p>
              {s?.user.full_name ?? "—"}
              {s ? ` · ${s.tenant.name} · оновлено ${formatUpdatedAt(s.generated_at)}` : ""}
            </p>
          </div>
        </div>

        <div className="bento teacher-home">
          <KpiTile
            {...KPI_PRESETS.lessons}
            label="Уроки цього тижня"
            value={s ? s.stats.lessons_this_week : <Sk w={36} h={22} />}
            delta={s ? `${s.stats.active_schedules} ${pluralUk(s.stats.active_schedules, "заняття", "заняття", "занять")} у розкладі` : null}
          />
          <KpiTile
            {...KPI_PRESETS.students}
            label="Мої учні"
            value={s ? s.stats.students : <Sk w={46} h={22} />}
            delta="у моїх гуртках"
          />
          <KpiTile
            {...KPI_PRESETS.clubs}
            label="Мої гуртки"
            value={s ? s.stats.clubs : <Sk w={36} h={22} />}
            delta="де я веду заняття"
          />
          <KpiTile
            {...KPI_PRESETS.teachers}
            label="Нараховано за місяць"
            value={
              s ? (monthPayroll === null ? "—" : `${formatCurrency(monthPayroll)} ₴`) : <Sk w={60} h={22} />
            }
            delta="за поточний місяць"
          />

          {/* TodaySchedule сам рендерить .tile — додаткова обгортка не потрібна */}
          <TodaySchedule events={todayEvents} />
        </div>
      </div>
    </>
  );
}
