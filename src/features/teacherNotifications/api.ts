import { apiGet, apiSend } from "../../lib/api";

export type NextLessonMode = "off" | "per_lesson" | "daily_digest";

export interface TeacherNotificationListItem {
  teacher_id: number;
  teacher_full_name: string;
  has_telegram: boolean;
  telegram_status: string;
  next_lesson_mode: NextLessonMode;
  next_lesson_mode_label: string;
  unmarked_first_enabled: boolean;
  unmarked_second_enabled: boolean;
  updated_at: string | null;
  editable: boolean;
}

export interface TeacherNotificationSettings extends TeacherNotificationListItem {
  next_lesson_offset_minutes: number;
  next_lesson_daily_digest_time: string;
  next_lesson_include_students: boolean;
  unmarked_first_delay_minutes: number;
  unmarked_second_delay_minutes: number;
  updated_by_user_id: number | null;
}

export interface TeacherNotificationPayload {
  next_lesson_mode: NextLessonMode;
  next_lesson_offset_minutes: number;
  next_lesson_daily_digest_time: string;
  next_lesson_include_students: boolean;
  unmarked_first_enabled: boolean;
  unmarked_first_delay_minutes: number;
  unmarked_second_enabled: boolean;
  unmarked_second_delay_minutes: number;
}

export const teacherNotificationQueries = {
  list: () => ({
    queryKey: ["teacher-notifications", "teachers"] as const,
    queryFn: () => apiGet<TeacherNotificationListItem[]>("/api/teacher-notifications/teachers"),
  }),
  settings: (teacherId: number | null) => ({
    queryKey: ["teacher-notifications", "settings", teacherId] as const,
    queryFn: () => apiGet<TeacherNotificationSettings>(`/api/teacher-notifications/${teacherId}`),
    enabled: teacherId != null,
  }),
};

export const teacherNotificationsApi = {
  update: (teacherId: number, data: TeacherNotificationPayload) =>
    apiSend<TeacherNotificationSettings>("PUT", `/api/teacher-notifications/${teacherId}`, data),
  test: (teacherId: number) =>
    apiSend<{ success: boolean }>("POST", `/api/teacher-notifications/${teacherId}/test`),
};

/* ── Власні налаштування вчителя ──────────────────────────────────────────
   Ендпоінти за teacher_id вимагають адміна, тож у вчителя свій /me. */

export const myNotificationQueries = {
  settings: () => ({
    queryKey: ["teacher-notifications", "me"] as const,
    queryFn: () => apiGet<TeacherNotificationSettings>("/api/teacher-notifications/me"),
  }),
};

export const myNotificationsApi = {
  update: (data: TeacherNotificationPayload) =>
    apiSend<TeacherNotificationSettings>("PUT", "/api/teacher-notifications/me", data),
};
