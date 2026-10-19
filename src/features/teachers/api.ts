import { apiGet, apiSend, apiUpload } from "../../lib/api";
import type { Schedule, Teacher, TeacherImportResult, TeacherInput } from "./types";

export interface TeacherStatDetail {
  id: number;
  date: string;
  club_name: string;
  group_name: string | null;
  status: string;
  notes: string | null;
  schedule_id: number;
}

export const teachersQueries = {
  list: () => ({
    queryKey: ["teachers", "list"] as const,
    // include_inactive: статусом керує фільтр на сторінці, неактивні теж потрібні
    queryFn: () => apiGet<Teacher[]>("/api/teachers?include_inactive=true&limit=500"),
  }),
  schedules: () => ({
    queryKey: ["schedules", "list"] as const,
    queryFn: () => apiGet<Schedule[]>("/api/schedules"),
  }),
  statDetails: (teacherId: number | null, type: string) => ({
    queryKey: ["teachers", "stat-details", teacherId, type] as const,
    queryFn: () => apiGet<TeacherStatDetail[]>(`/api/teachers/${teacherId}/stat_details?type=${type}`),
    enabled: teacherId != null,
  }),
};

export const teachersApi = {
  create: (data: TeacherInput) => apiSend<Teacher>("POST", "/api/teachers", data),
  update: (id: number, data: Partial<TeacherInput>) =>
    apiSend<Teacher>("PUT", `/api/teachers/${id}`, data),
  /** Розумне видалення: без force бекенд деактивує вчителя з історією. */
  remove: (id: number, force: boolean) =>
    apiSend<Record<string, unknown>>("DELETE", `/api/teachers/${id}?force=${force}`),
  toggleActive: (id: number) =>
    apiSend<Record<string, unknown>>("POST", `/api/teachers/${id}/toggle-active`),
  calendarLink: (id: number) =>
    apiGet<{ link: string; token: string }>(`/api/teachers/${id}/calendar-link`),
  importExcel: (file: File) => apiUpload<TeacherImportResult>("/api/teachers/import", file),
};

export const teachersLinks = {
  exportExcel: "/api/teachers/export/excel",
  template: "/api/teachers/template",
};
