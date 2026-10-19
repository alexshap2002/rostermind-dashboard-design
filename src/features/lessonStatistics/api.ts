import { apiGet } from "../../lib/api";
import type { Club } from "../students/types";
import type { Teacher } from "../teachers/types";

/** GET /api/conducted_lessons/teacher_daily_summary + /lesson_anomalies. */
export interface SummaryLesson {
  lesson_id: number;
  lesson_event_id: number | null;
  lesson_date: string;
  club_id: number | null;
  club_name: string | null;
  teacher_status: string | null; // PRESENT | ABSENT | null
  total_students: number;
  present_students: number;
  notes: string | null;
  lesson_amount: string | number | null;
  payroll_id: number | null;
  tariff_type: string | null;
  tariff_amount: string | number | null;
  tariff_label: string | null;
}
export interface TeacherDailySummary {
  teacher_id: number;
  teacher_name: string;
  lessons_total: number;
  lessons_present: number;
  lessons_absent: number;
  lessons_unmarked: number;
  total_amount: string | number;
  has_active_tariff_today: boolean;
  lessons: SummaryLesson[];
}
export interface AnomalyTeacher {
  teacher_id: number;
  teacher_name: string;
  status: string | null;
  has_tariff: boolean;
  tariff_amount: string | number | null;
  tariff_label: string | null;
  has_payroll: boolean;
  payroll_amount: string | number | null;
}
export interface LessonAnomaly {
  lesson_id: number;
  lesson_event_id: number | null;
  lesson_date: string;
  club_id: number | null;
  club_name: string | null;
  total_students: number;
  present_students: number;
  notes: string | null;
  anomaly_types: string[];
  teachers: AnomalyTeacher[];
}

export interface LessonStatFilters {
  dateFrom: string;
  dateTo: string;
  teacherId: string;
  clubId: string;
}

function qs(f: LessonStatFilters) {
  const params = new URLSearchParams();
  if (f.dateFrom) params.set("date_from", f.dateFrom);
  if (f.dateTo) params.set("date_to", f.dateTo);
  if (f.teacherId) params.set("teacher_id", f.teacherId);
  if (f.clubId) params.set("club_id", f.clubId);
  return params.toString();
}

export const lessonStatisticsQueries = {
  summary: (f: LessonStatFilters) => ({
    queryKey: ["lessonStatistics", "summary", f] as const,
    queryFn: () =>
      apiGet<TeacherDailySummary[]>(`/api/conducted_lessons/teacher_daily_summary?${qs(f)}`),
  }),
  anomalies: (f: LessonStatFilters) => ({
    queryKey: ["lessonStatistics", "anomalies", f] as const,
    queryFn: () =>
      apiGet<LessonAnomaly[]>(`/api/conducted_lessons/lesson_anomalies?${qs(f)}`),
  }),
  clubs: () => ({
    queryKey: ["clubs", "list"] as const,
    queryFn: () => apiGet<Club[]>("/api/clubs"),
  }),
  teachers: () => ({
    queryKey: ["teachers", "list"] as const,
    queryFn: () => apiGet<Teacher[]>("/api/teachers?include_inactive=true&limit=500"),
  }),
};

export const ANOMALY_LABELS: Record<string, string> = {
  NO_PRESENT_STUDENTS: "Немає присутніх дітей",
  PRESENT_TARIFF_TEACHER_WITHOUT_PAYROLL: "Тарифний вчитель без зарплати",
  ABSENT_TARIFF_TEACHER_ONLY_VOLUNTEER_PRESENT_NO_PAYROLL: "Тарифний відсутній, лише волонтери",
};

export function teacherStatusLabel(status: string | null): { label: string; tone: "create" | "delete" | "neutral" } {
  if (status === "PRESENT") return { label: "Присутній", tone: "create" };
  if (status === "ABSENT") return { label: "Відсутній", tone: "delete" };
  return { label: "Не відмічено", tone: "neutral" };
}
