import { apiGet, apiSend } from "../../lib/api";
import type { Club } from "../students/types";
import type { Teacher } from "../teachers/types";

/** Контракти V2 multi-teacher API (app/api/schemas/schedule_schemas.py). */
export interface ScheduleTeacherV2 {
  id: number;
  teacher_id: number;
  teacher_name: string;
  is_primary: boolean;
  order: number;
}

export interface ScheduleV2 {
  id: number;
  club_id: number;
  club_name: string | null;
  weekday: number; // 1 = Понеділок … 7 = Неділя
  start_time: string; // "HH:MM:SS"
  group_name: string | null;
  active: boolean;
  enrolled_count: number | null;
  teachers: ScheduleTeacherV2[];
  primary_teacher_id: number | null;
  primary_teacher_name: string | null;
}

export interface ScheduleInput {
  club_id: number;
  weekday: number;
  start_time: string; // "HH:MM"
  teachers: { teacher_id: number; is_primary: boolean; order: number }[];
  group_name: string;
  active: boolean;
}

export interface ManagedStudent {
  id: number;
  first_name: string;
  last_name: string;
  age: number | null;
  grade: string | null;
  birth_date: string | null;
  enrolled_clubs: string[];
}

export interface StudentsManagement {
  schedule_id: number;
  total_students: number;
  enrolled_count: number;
  available_count: number;
  enrolled_students: ManagedStudent[];
  available_students: ManagedStudent[];
}

export const schedulesQueries = {
  list: () => ({
    queryKey: ["schedules", "v2"] as const,
    queryFn: () =>
      apiGet<ScheduleV2[]>("/api/schedules/v2?include_inactive=true&include_counts=true&limit=500"),
  }),
  clubs: () => ({
    queryKey: ["clubs", "list"] as const,
    queryFn: () => apiGet<Club[]>("/api/clubs"),
  }),
  teachers: () => ({
    queryKey: ["teachers", "list"] as const,
    queryFn: () => apiGet<Teacher[]>("/api/teachers?include_inactive=true&limit=500"),
  }),
  studentsManagement: (scheduleId: number) => ({
    queryKey: ["schedules", "students", scheduleId] as const,
    queryFn: () =>
      apiGet<StudentsManagement>(`/api/schedules/v2/${scheduleId}/students-management`),
  }),
};

/** Політики «отримувачі відмітки» (app/api/schedules.py attendance-policies). */
export type RecipientMode = "ALL_TEACHERS" | "CUSTOM";
export interface PolicyConfig {
  mode: RecipientMode;
  recipients: { recipient_type: "TEACHER"; recipient_id: number }[];
}
export interface AttendancePolicies {
  students: PolicyConfig;
  teachers: PolicyConfig;
}

export const schedulesApi = {
  create: (data: ScheduleInput) => apiSend<ScheduleV2>("POST", "/api/schedules/v2", data),
  policiesGet: (id: number) =>
    apiGet<AttendancePolicies>(`/api/schedules/${id}/attendance-policies`),
  policiesPut: (id: number, data: AttendancePolicies) =>
    apiSend<AttendancePolicies>("PUT", `/api/schedules/${id}/attendance-policies`, data),
  update: (id: number, data: Partial<ScheduleInput>) =>
    apiSend<ScheduleV2>("PUT", `/api/schedules/v2/${id}`, data),
  remove: (id: number) => apiSend("DELETE", `/api/schedules/v2/${id}`),
  /** v1-ендпоінти коректно скасовують/відновлюють майбутні заняття. */
  deactivate: (id: number) => apiSend<Record<string, unknown>>("POST", `/api/schedules/${id}/deactivate`),
  reactivate: (id: number) => apiSend<Record<string, unknown>>("POST", `/api/schedules/${id}/reactivate`),
  enroll: (student_id: number, schedule_id: number) =>
    apiSend("POST", "/api/schedule-enrollments", { student_id, schedule_id }),
  unenroll: (student_id: number, schedule_id: number) =>
    apiSend("DELETE", `/api/schedule-enrollments/student/${student_id}/schedule/${schedule_id}`),
};

export const schedulesLinks = {
  exportExcel: "/api/schedules/export/excel",
};

export const WEEKDAY_FULL: Record<number, string> = {
  1: "Понеділок", 2: "Вівторок", 3: "Середа", 4: "Четвер",
  5: "П'ятниця", 6: "Субота", 7: "Неділя",
};

export const WEEKDAY_SHORT: Record<number, string> = {
  1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб", 7: "Нд",
};

export function hhmm(t: string): string {
  return t.slice(0, 5);
}
