/** Форми відповідей бекенду (узгоджені з app/api/public.py та app/api/audit.py). */

export interface DashboardSummary {
  user: { full_name: string; role: string; initials: string };
  tenant: { name: string; slug: string };
  stats: {
    students: number;
    students_delta_month: number;
    teachers: number;
    clubs: number;
    active_schedules: number;
    lessons_this_week: number;
  };
  payroll_by_month: { month: string; total: number }[];
  generated_at: string;
}

/** Критерії вразливості закладу — рівно поточний список (vulnerability_criteria_service.summary). */
export interface VulnerabilitySummary {
  students_total: number;
  with_criteria: number;
  without_criteria: number;
  items: { id: number; key: string | null; name: string; count: number }[];
}

export interface DashboardCharts {
  students_by_clubs: { labels: string[]; data: number[]; type: string };
  attendance_trend: { labels: string[]; data: number[]; type: string };
  salary_trend: { labels: string[]; data: number[]; type: string };
  vulnerability?: VulnerabilitySummary;
  [key: string]: unknown;
}

export interface AuditLog {
  id: number;
  action_type: string;
  entity_type: string;
  entity_name: string | null;
  user_name: string | null;
  description?: string | null;
  timestamp: string;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CalendarEvent {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  club_id: number | null;
  club_name: string;
  teacher_id: number | null;
  teacher_name: string;
  teacher_names: string[];
  status: string;
  schedule_id: number | null;
}
