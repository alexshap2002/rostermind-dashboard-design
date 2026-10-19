import { apiGet } from "../../lib/api";

export interface MainBranchFilters {
  dateFrom: string;
  dateTo: string;
  branchIds: number[]; // порожньо = всі філії
  refresh?: boolean; // true = обійти серверний кеш
}

export interface NetworkContext {
  owner_account_id: number;
  network_role: "network_owner" | "network_admin" | "finance_manager" | "regional_manager" | "analyst";
  primary_tenant_id: number | null;
  capabilities: {
    datasets: string[];
    export_datasets: string[];
    can_manage_members: boolean;
    can_manage_branches: boolean;
    can_manage_billing: boolean;
    can_switch_branch: boolean;
    can_export_full_report: boolean;
  };
  branches: Array<{
    tenant_id: number;
    tenant_name: string;
    lifecycle_status: string;
    lifecycle_reason: string | null;
    is_primary: boolean;
    is_current: boolean;
  }>;
}

function qs(f: MainBranchFilters): string {
  const p = new URLSearchParams();
  if (f.dateFrom) p.set("date_from", f.dateFrom);
  if (f.dateTo) p.set("date_to", f.dateTo);
  for (const id of f.branchIds) p.append("branch_ids", String(id));
  if (f.refresh) p.set("refresh", "true");
  return p.toString();
}

export interface CompareCell { current: number | null; previous: number | null; delta_percent: number | null; delta_percentage_points?: number | null }

export interface BranchRow {
  tenant_id: number;
  tenant_name: string;
  students_total: number;
  students_new: number;
  teachers_total: number;
  lessons_scheduled: number;
  lessons_completed: number;
  lessons_skipped: number;
  lessons_cancelled: number;
  lessons_unmarked_overdue: number;
  /** сьогодні й пізніше, ще не відмічені */
  lessons_upcoming: number;
  present_students: number;
  total_students: number;
  /** null — уроків за період не було */
  attendance_rate_pct: number | null;
  previous_attendance_rate_pct: number | null;
  attendance_change_pp: number | null;
  payroll_uah: number;
}

export interface MainBranchKpi {
  branches_total: number;
  branches_total_all: number;
  branches_pending_or_inactive: number;
  students_total: number;
  students_new: number;
  teachers_total: number;
  lessons_total: number;
  lessons_scheduled: number;
  lessons_completed: number;
  lessons_skipped: number;
  lessons_cancelled: number;
  lessons_unmarked_overdue: number;
  lessons_upcoming: number;
  attendance_rate_pct: number;
  attendance_has_data: boolean;
  payroll_total_uah: number;
  branch_rows: BranchRow[];
  generated_at: string;
  /** Порожньо — порівнювати нема з чим (у періоді лише сьогоднішній день, що ще триває). */
  comparison: {
    current_period?: { date_from: string; date_to: string };
    previous_period?: { date_from: string; date_to: string };
    lessons_completed?: CompareCell;
    attendance_rate_pct?: CompareCell;
    payroll_total_uah?: CompareCell;
  };
}

export interface LessonsRow {
  tenant_id: number; tenant_name: string; lessons_total: number; completed: number; skipped: number; cancelled: number;
  unmarked_overdue: number; upcoming: number; students_total: number; students_present_total: number; attendance_rate_pct: number | null;
}
export interface ClubRow {
  tenant_id: number; tenant_name: string; club_id: number | null; club_name: string; teacher_names: string;
  lessons_scheduled: number; lessons_completed: number; lessons_unmarked_overdue: number;
  present_students: number; total_students: number;
  attendance_rate_pct: number | null; previous_attendance_rate_pct: number | null; attendance_change_pp: number | null;
}
export interface AttendanceRow {
  tenant_id: number; tenant_name: string; expected_students: number; present_students: number; absent_students: number;
  attendance_rate_pct: number | null; chronic_absence_students_count: number;
}
export interface ChronicRow {
  tenant_id: number; tenant_name: string; student_id: number; student_name: string;
  lessons: number; absences: number; absence_pct: number;
}
export interface PayrollRow {
  tenant_id: number; tenant_name: string; teacher_id: number; teacher_name: string; lessons_paid: number;
  lessons_amount_uah: number; bonus_amount_uah: number; total_uah: number;
}
export interface AnomalyRow {
  tenant_id: number; tenant_name: string; lesson_id: number | null; lesson_date: string | null;
  club_name: string | null; anomaly_type: string; severity: string; summary_text: string;
  action_label: string | null; action_url: string | null;
  details_json?: { teacher_name?: string | null; lesson_day?: string; days_late?: number } & Record<string, unknown>;
}
export interface AnomalyPage {
  rows: AnomalyRow[];
  totals: { total: number; by_severity?: Record<string, number>; by_type?: Record<string, number> };
  page: { limit: number; cursor: number; next_cursor: number | null; returned: number; total: number };
}
export interface AttentionItem {
  tenant_id: number; tenant_name: string; anomaly_type: string; severity: string;
  summary: string; action_label: string | null; action_url: string | null; lesson_date: string | null;
  club_name: string | null;
}
export interface AttentionReport {
  totals: { critical: number; high: number; warning: number; total: number; by_tenant: Record<string, number> };
  items: AttentionItem[];
  generated_at: string;
}
export interface TrendDay {
  date: string; lessons: number; present_students: number; total_students: number;
  attendance_rate_pct: number | null; has_data: boolean; payroll_uah: number;
}
export interface TrendWeek {
  week: string; week_start: string; date_from: string; date_to: string;
  lessons: number; present_students: number; total_students: number;
  attendance_rate_pct: number | null; has_data: boolean; payroll_uah: number;
}
export interface TrendBranch {
  tenant_id: number; tenant_name: string;
  daily: Array<{ date: string; attendance_rate_pct: number | null }>;
  weekly: Array<{ week_start: string; attendance_rate_pct: number | null }>;
}
export interface TrendsReport {
  series: { daily: TrendDay[]; weekly: TrendWeek[]; by_branch: TrendBranch[] };
  generated_at?: string;
}

export interface TableReport<Row> { rows: Row[]; totals: Record<string, number | null> }
export interface LessonsReport extends TableReport<LessonsRow> { club_rows: ClubRow[] }
export interface AttendanceReport extends TableReport<AttendanceRow> { chronic_rows: ChronicRow[] }
export interface TeachersReport {
  rows: Array<Record<string, number | string>>;
  payroll_rows: PayrollRow[];
  payroll_totals: { lessons_amount_uah: number; bonus_amount_uah: number; total_uah: number };
}

export const UNMARKED_LESSON = "UNMARKED_LESSON";

export interface AnomalyFilter { severity?: string; type?: string }

export const mainBranchQueries = {
  context: () => ({
    queryKey: ["network", "context"] as const,
    queryFn: () => apiGet<NetworkContext>("/api/network/context"),
  }),
  kpi: (f: MainBranchFilters) => ({
    queryKey: ["main-branch", "kpi", f] as const,
    queryFn: () => apiGet<MainBranchKpi>(`/api/owner/main-branch/kpi?${qs(f)}`),
  }),
  attention: (f: MainBranchFilters) => ({
    queryKey: ["main-branch", "attention", f] as const,
    queryFn: () => apiGet<AttentionReport>(`/api/owner/main-branch/attention?${qs(f)}`),
  }),
  lessons: (f: MainBranchFilters) => ({
    queryKey: ["main-branch", "lessons", f] as const,
    queryFn: () => apiGet<LessonsReport>(`/api/owner/main-branch/lessons?${qs(f)}`),
  }),
  attendance: (f: MainBranchFilters) => ({
    queryKey: ["main-branch", "attendance", f] as const,
    queryFn: () => apiGet<AttendanceReport>(`/api/owner/main-branch/attendance?${qs(f)}`),
  }),
  teachers: (f: MainBranchFilters) => ({
    queryKey: ["main-branch", "teachers", f] as const,
    queryFn: () => apiGet<TeachersReport>(`/api/owner/main-branch/teachers?${qs(f)}`),
  }),
  anomalies: (f: MainBranchFilters, cursor = 0, limit = 100, filter: AnomalyFilter = {}) => ({
    queryKey: ["main-branch", "anomalies", f, cursor, limit, filter] as const,
    queryFn: () => {
      const extra = new URLSearchParams({ cursor: String(cursor), limit: String(limit) });
      if (filter.severity) extra.set("severity", filter.severity);
      if (filter.type) extra.set("anomaly_type", filter.type);
      return apiGet<AnomalyPage>(`/api/owner/main-branch/anomalies?${qs(f)}&${extra.toString()}`);
    },
  }),
  trends: (f: MainBranchFilters) => ({
    queryKey: ["main-branch", "trends", f] as const,
    queryFn: () => apiGet<TrendsReport>(`/api/owner/main-branch/trends?${qs(f)}`),
  }),
};

export function mainBranchExportUrl(dataset: string, f: MainBranchFilters, format: "xlsx" | "csv"): string {
  const p = new URLSearchParams({ dataset, format });
  if (f.dateFrom) p.set("date_from", f.dateFrom);
  if (f.dateTo) p.set("date_to", f.dateTo);
  for (const id of f.branchIds) p.append("branch_ids", String(id));
  return `/api/owner/main-branch/export?${p.toString()}`;
}

export const SEVERITY: Record<string, { label: string; tone: "delete" | "enroll" | "update" | "neutral" }> = {
  critical: { label: "Терміново", tone: "delete" },
  high: { label: "Важливо", tone: "delete" },
  warning: { label: "Перевірити", tone: "enroll" },
  medium: { label: "Середній", tone: "enroll" },
  low: { label: "Низький", tone: "update" },
  info: { label: "Інфо", tone: "neutral" },
};

export const ANOMALY_LABELS: Record<string, string> = {
  UNMARKED_LESSON: "Урок не відмічено",
  NO_PRESENT_STUDENTS: "На уроці нікого не було",
  PRESENT_TARIFF_TEACHER_WITHOUT_PAYROLL: "Урок є, зарплати немає",
  ABSENT_TARIFF_TEACHER_ONLY_VOLUNTEER_PRESENT_NO_PAYROLL: "Був лише волонтер",
  PAYROLL_LAG: "Зарплату ще не нараховано",
  CHRONIC_ABSENCE_CLUSTER: "Діти часто пропускають",
  ATTENDANCE_DROP: "Відвідуваність впала",
  BILLING_PAST_DUE: "Оплата філії",
};
