import { apiGet } from "../../lib/api";
import type { Club } from "../students/types";

/** GET /api/attendance-reporting (app/api/attendance_reporting.py). */
export interface DailyStat {
  date: string;
  unique_present_children: number;
  present_marks: number;
  sessions_held: number;
}
export interface ByClubRow {
  club_id: number;
  club_name: string;
  sessions_held: number;
  unique_present_children: number;
  present_marks: number;
}
export interface PerfectAttendanceRow {
  child_id: number;
  full_name: string;
  clubs: string[];
  sessions_expected: number;
  sessions_present: number;
  attendance_rate: number;
}
export interface AttendanceReport {
  daily_stats: DailyStat[];
  monthly_kpi: {
    total_sessions_held: number;
    total_unique_present_children: number;
    total_present_marks: number;
    avg_unique_present_per_day: number;
    avg_present_marks_per_session: number;
  };
  by_club: ByClubRow[];
  by_club_totals: {
    total_sessions_held: number;
    total_unique_present_children: number;
    total_present_marks: number;
  };
  perfect_attendance: PerfectAttendanceRow[];
  children_stats: {
    children_active_count: number;
    new_children_count: number;
    new_children_list: { child_id: number; full_name: string; created_at: string }[];
  };
}

export interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  clubId: string;
}

export const statisticsQueries = {
  report: (f: ReportFilters) => ({
    queryKey: ["statistics", "report", f] as const,
    queryFn: () => {
      const params = new URLSearchParams({ date_from: f.dateFrom, date_to: f.dateTo });
      if (f.clubId) params.set("club_id", f.clubId);
      return apiGet<AttendanceReport>(`/api/attendance-reporting?${params}`);
    },
  }),
  clubs: () => ({
    queryKey: ["clubs", "list"] as const,
    queryFn: () => apiGet<Club[]>("/api/clubs"),
  }),
};
