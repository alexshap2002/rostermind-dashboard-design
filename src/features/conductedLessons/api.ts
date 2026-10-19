import { apiGet, apiSend } from "../../lib/api";

export interface ConductedLessonTeacher {
  teacher_id: number;
  full_name: string;
  status: "PRESENT" | "ABSENT" | "UNMARKED" | string;
  has_payroll: boolean;
  payroll_id: number | null;
  payroll_amount: number | null;
}

export interface ConductedLesson {
  id: number;
  teacher_id: number;
  teacher_name: string;
  teachers: ConductedLessonTeacher[];
  club_id: number | null;
  club_name: string | null;
  lesson_event_id: number;
  lesson_date: string;
  lesson_duration_minutes: number | null;
  total_students: number;
  present_students: number;
  absent_students: number;
  attendance_rate: number;
  notes: string | null;
  lesson_topic: string | null;
  is_salary_calculated: boolean;
  is_valid_for_salary: boolean;
  created_at: string;
}

export interface ConductedLessonFilters {
  teacher_id?: number | "";
  club_id?: number | "";
  start_date?: string;
  end_date?: string;
  only_uncalculated?: boolean;
  limit?: number;
}

export interface AvailableLessonSchedule {
  id: number;
  display_name: string;
  teacher_name: string;
  teacher_names?: string[];
  teachers?: Array<{ teacher_id: number; full_name: string }>;
  club_name: string;
  day_name: string;
  time: string;
  student_count: number;
}

export interface ScheduleStudent {
  student_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  status: "PRESENT" | "ABSENT" | string;
}

export interface LessonStudent {
  student_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  attendance_id: number;
  status: "PRESENT" | "ABSENT" | "UNMARKED" | string;
}

export interface ManualLessonCreateInput {
  schedule_id: number;
  lesson_date: string;
  student_attendance: Array<{ student_id: number; status: "PRESENT" | "ABSENT" }>;
  teacher_attendance?: Array<{ teacher_id: number; status: "PRESENT" | "ABSENT" }>;
  notes?: string | null;
  lesson_duration_minutes?: number | null;
  auto_calculate_payroll: boolean;
}

export interface ManualLessonCreateResult {
  success: boolean;
  message: string;
  conducted_lesson_id: number;
  lesson_event_id: number;
  present_students: number;
  total_students: number;
  payroll_created: boolean;
}

export interface DeleteLessonResult {
  error?: string;
  message: string;
  dependencies?: {
    attendance_records: number;
    payroll_records: number;
  };
  deleted?: boolean;
}

/** PUT /{id}/teachers — присутність вчителів + нарахування (app/api/conducted_lessons.py). */
export interface TeacherPresenceUpdate {
  teacher_id: number;
  status: "PRESENT" | "ABSENT";
  payroll_enabled: boolean;
  payroll_amount: number | null;
}

/** PUT /{id} — мета-поля уроку (лише owner/admin). */
export interface LessonMetaUpdate {
  lesson_date?: string;
  lesson_duration_minutes?: number | null;
  total_students?: number;
  present_students?: number;
  absent_students?: number;
  notes?: string | null;
  lesson_topic?: string | null;
}

function qs(filters: ConductedLessonFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || value === false) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const conductedLessonsQueries = {
  list: (filters: ConductedLessonFilters) => ({
    queryKey: ["conducted-lessons", "list", filters] as const,
    queryFn: () => apiGet<ConductedLesson[]>(`/api/conducted_lessons${qs(filters)}`),
  }),
  availableSchedules: () => ({
    queryKey: ["conducted-lessons", "available-schedules"] as const,
    queryFn: () => apiGet<AvailableLessonSchedule[]>("/api/conducted_lessons/available-schedules"),
  }),
  scheduleStudents: (scheduleId: number | null) => ({
    queryKey: ["conducted-lessons", "schedule-students", scheduleId] as const,
    queryFn: () => apiGet<ScheduleStudent[]>(`/api/conducted_lessons/schedule/${scheduleId}/students`),
    enabled: !!scheduleId,
  }),
  lessonStudents: (lessonId: number | null) => ({
    queryKey: ["conducted-lessons", "lesson-students", lessonId] as const,
    queryFn: () => apiGet<LessonStudent[]>(`/api/conducted_lessons/${lessonId}/students`),
    enabled: !!lessonId,
  }),
  byId: (lessonId: number | null) => ({
    queryKey: ["conducted-lessons", "by-id", lessonId] as const,
    queryFn: () => apiGet<ConductedLesson>(`/api/conducted_lessons/${lessonId}`),
    enabled: !!lessonId,
  }),
};

export const conductedLessonsApi = {
  createManual: (data: ManualLessonCreateInput) =>
    apiSend<ManualLessonCreateResult>("POST", "/api/conducted_lessons/manual", data),
  updateStudentStatus: (lessonId: number, studentId: number, status: "PRESENT" | "ABSENT") =>
    apiSend<Record<string, unknown>>(
      "PUT",
      `/api/conducted_lessons/${lessonId}/students/${studentId}/status`,
      { status },
    ),
  updateTeachers: (lessonId: number, teachers: TeacherPresenceUpdate[]) =>
    apiSend<{ success: boolean; message: string }>(
      "PUT",
      `/api/conducted_lessons/${lessonId}/teachers`,
      { teachers },
    ),
  updateMeta: (lessonId: number, data: LessonMetaUpdate) =>
    apiSend<ConductedLesson>("PUT", `/api/conducted_lessons/${lessonId}`, data),
  remove: (lessonId: number, force = false) =>
    apiSend<DeleteLessonResult>("DELETE", `/api/conducted_lessons/${lessonId}?force=${force}`),
};

export const conductedLessonsLinks = {
  exportExcel: "/api/conducted_lessons/export/excel",
  /** Експорт із урахуванням активних фільтрів (бекенд приймає teacher_id/club_id/start_date/end_date). */
  exportUrl: (filters: ConductedLessonFilters) => {
    const p = new URLSearchParams();
    if (filters.teacher_id) p.set("teacher_id", String(filters.teacher_id));
    if (filters.club_id) p.set("club_id", String(filters.club_id));
    if (filters.start_date) p.set("start_date", filters.start_date);
    if (filters.end_date) p.set("end_date", filters.end_date);
    const s = p.toString();
    return `/api/conducted_lessons/export/excel${s ? `?${s}` : ""}`;
  },
};
