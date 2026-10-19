import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { TopNav } from "../../components/layout/TopNav";
import { HeroAttendanceChart } from "../../components/dashboard/HeroAttendanceChart";
import {
  KPI_PRESETS, KpiTile, PayrollTile, QuickActions, RecentActions,
  SalaryTrendTile, Sk, SocialProfileTile, TodaySchedule, TopClubs,
} from "../../components/dashboard/tiles";
import { conductedLessonsQueries } from "../conductedLessons/api";
import { dashboardQueries } from "./api";
import { formatUpdatedAt, monthShortFromKey } from "../../lib/format";

type Period = "week" | "month" | "year";

const PERIOD_META: Record<Period, { title: string; hint: string; prevLabel: string; avgLabel: string }> = {
  week: {
    title: "Відвідуваність · останні 14 днів",
    hint: "Середня відвідуваність по днях із заняттями",
    prevLabel: "до попереднього дня",
    avgLabel: "середнє за 3 дні",
  },
  month: {
    title: "Відвідуваність · останні 6 місяців",
    hint: "Динаміка середньої відвідуваності по місяцях",
    prevLabel: "до попереднього місяця",
    avgLabel: "середнє за 3 міс",
  },
  year: {
    title: "Відвідуваність · останні 12 місяців",
    hint: "Динаміка середньої відвідуваності по місяцях",
    prevLabel: "до попереднього місяця",
    avgLabel: "середнє за 3 міс",
  },
};

const isoDate = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** "06/2026" → "Чер". */
const monthAxisLabel = (raw: string) => {
  const [mm, yyyy] = raw.split("/");
  return monthShortFromKey(`${yyyy}-${mm}`);
};

/** "2026-06-23" → "23.06". */
const dayAxisLabel = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>("month");

  const summary = useQuery(dashboardQueries.summary());
  const charts = useQuery(dashboardQueries.charts());
  const actions = useQuery(dashboardQueries.recentActions());
  const today = useQuery(dashboardQueries.todayEvents());

  // Тижневий режим: уроки за 14 днів, зважена відвідуваність по днях
  const weekRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 13);
    return { start_date: isoDate(from), end_date: isoDate(to), limit: 1000 };
  }, []);
  const weekLessons = useQuery({
    ...conductedLessonsQueries.list(weekRange),
    enabled: period === "week",
    staleTime: 60_000,
  });

  const hero = useMemo(() => {
    if (period === "week") {
      const byDay = new Map<string, { present: number; total: number }>();
      for (const lesson of weekLessons.data ?? []) {
        const day = lesson.lesson_date.slice(0, 10);
        const agg = byDay.get(day) ?? { present: 0, total: 0 };
        agg.present += lesson.present_students;
        agg.total += lesson.total_students;
        byDay.set(day, agg);
      }
      const days = [...byDay.entries()]
        .filter(([, v]) => v.total > 0)
        .sort(([a], [b]) => a.localeCompare(b));
      return {
        labels: days.map(([d]) => dayAxisLabel(d)),
        data: days.map(([, v]) => Math.round((v.present / v.total) * 1000) / 10),
        loading: weekLessons.isLoading,
      };
    }
    const trend = charts.data?.attendance_trend;
    const n = period === "year" ? 12 : 6;
    return {
      labels: (trend?.labels ?? []).slice(-n).map(monthAxisLabel),
      data: (trend?.data ?? []).slice(-n),
      loading: charts.isLoading,
    };
  }, [period, weekLessons.data, weekLessons.isLoading, charts.data, charts.isLoading]);

  // 401 → на логін
  if (summary.error instanceof ApiError && summary.error.status === 401) {
    return <Navigate to="/login" replace />;
  }
  // 403 → вчитель: для нього кабінет ще в класичній адмінці
  if (summary.error instanceof ApiError && summary.error.status === 403) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-brand">
            <img className="brand-logo" src="/static/logo.png" alt="" />
            <div>
              <div className="lt">RosterMind</div>
              <div className="ls">Облік відвідуваності</div>
            </div>
          </div>
          <h1>Кабінет вчителя</h1>
          <p className="subtitle">
            Нова панель поки доступна власникам та адміністраторам. Ваш кабінет —
            у класичному інтерфейсі.
          </p>
          <a className="btn login-btn" href="/admin/">Відкрити кабінет вчителя</a>
        </div>
      </div>
    );
  }

  const s = summary.data;
  const c = charts.data;
  const counts = s
    ? {
        students: s.stats.students,
        teachers: s.stats.teachers,
        clubs: s.stats.clubs,
        active_schedules: s.stats.active_schedules,
      }
    : {};

  const meta = PERIOD_META[period];
  const lastVal = hero.data.length ? hero.data[hero.data.length - 1] : null;
  const prevVal = hero.data.length > 1 ? hero.data[hero.data.length - 2] : null;
  const delta = lastVal !== null && prevVal !== null ? lastVal - prevVal : null;
  const avg3 = hero.data.length
    ? hero.data.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, hero.data.length)
    : null;

  return (
    <>
      <TopNav counts={counts} user={s?.user} tenantName={s?.tenant.name} />

      <div className="content">
        <div className="page-head">
          <div>
            <h2>Панель адміністратора</h2>
            <p>
              {s?.tenant.name ?? "—"}
              {s ? ` · оновлено ${formatUpdatedAt(s.generated_at)}` : ""}
            </p>
          </div>
          <div className="seg">
            <button className={period === "week" ? "on" : ""} onClick={() => setPeriod("week")}>Тиждень</button>
            <button className={period === "month" ? "on" : ""} onClick={() => setPeriod("month")}>Місяць</button>
            <button className={period === "year" ? "on" : ""} onClick={() => setPeriod("year")}>Рік</button>
          </div>
        </div>

        <div className="bento">
          {/* KPI-ряд: той самий набір, що legacy stat-картки */}
          <KpiTile
            {...KPI_PRESETS.students}
            label="Учні"
            value={s ? s.stats.students : <Sk w={46} h={22} />}
            delta={
              s ? (
                <>
                  <b className="up">+{s.stats.students_delta_month}</b> за місяць
                </>
              ) : null
            }
          />
          <KpiTile
            {...KPI_PRESETS.teachers}
            label="Вчителі"
            value={s ? s.stats.teachers : <Sk w={36} h={22} />}
            delta="у штаті"
          />
          <KpiTile
            {...KPI_PRESETS.clubs}
            label="Гуртки"
            value={s ? s.stats.clubs : <Sk w={36} h={22} />}
            delta="активних гуртків"
          />
          <KpiTile
            {...KPI_PRESETS.lessons}
            label="Активні заняття"
            value={s ? s.stats.active_schedules : <Sk w={36} h={22} />}
            delta={s ? `${s.stats.lessons_this_week} уроків цього тижня` : null}
          />

          {/* Hero: динаміка відвідуваності (legacy-віджет №1), період — перемикачем угорі */}
          <div className="tile t-hero">
            <div className="label">{meta.title}</div>
            <div className="row">
              <div className="big num">
                {lastVal !== null ? lastVal.toFixed(1) : "—"}
                <span className="hi">%</span>
              </div>
              <div className="legend">
                <span><i className="dot" style={{ background: "var(--terra-on)" }} />середня по школі</span>
              </div>
            </div>
            <div className="sub">
              {delta !== null ? (
                <>
                  {delta >= 0 ? "↗ +" : "↘ "}
                  {delta.toFixed(1)}% {meta.prevLabel}
                  {avg3 !== null && ` · ${meta.avgLabel}: ${avg3.toFixed(1)}%`}
                </>
              ) : (
                meta.hint
              )}
            </div>
            <HeroAttendanceChart labels={hero.labels} data={hero.data} loading={hero.loading} />
          </div>

          <TodaySchedule events={today.data ?? []} />

          {/* Соціальний профіль (legacy-віджет №4) */}
          <SocialProfileTile data={c?.vulnerability} />

          {/* Розподіл учнів по гуртках (legacy-віджет №3) */}
          <TopClubs
            labels={c?.students_by_clubs?.labels ?? []}
            data={c?.students_by_clubs?.data ?? []}
          />

          <RecentActions logs={actions.data?.logs ?? []} />

          <QuickActions />

          {/* Зарплати — у самому низу: панель показують батькам */}
          {/* Динаміка зарплат (legacy-віджет №2) */}
          <SalaryTrendTile
            labels={c?.salary_trend?.labels ?? []}
            data={c?.salary_trend?.data ?? []}
          />

          <PayrollTile months={s?.payroll_by_month ?? []} />
        </div>
      </div>
    </>
  );
}
