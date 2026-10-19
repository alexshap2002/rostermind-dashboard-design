import { apiGet, apiSend, apiUpload } from "../../lib/api";
import type { Club, Enrollment, ImportResult, Student, StudentFull, StudentInput } from "./types";

export const studentsQueries = {
  list: () => ({
    queryKey: ["students", "list"] as const,
    // Бекенд без серверного пошуку — тягнемо всіх (тенант) і фільтруємо на клієнті, як legacy
    queryFn: () => apiGet<Student[]>("/api/students?limit=2000"),
  }),
  clubs: () => ({
    queryKey: ["clubs", "list"] as const,
    queryFn: () => apiGet<Club[]>("/api/clubs"),
  }),
  enrollments: () => ({
    queryKey: ["enrollments", "list"] as const,
    queryFn: () => apiGet<Enrollment[]>("/api/enrollments"),
  }),
  full: (studentId: number) => ({
    queryKey: ["students", "full", studentId] as const,
    queryFn: () => apiGet<StudentFull>(`/api/students/${studentId}/full`),
  }),
};

export const studentsApi = {
  create: (data: StudentInput) => apiSend<Student>("POST", "/api/students", data),
  update: (id: number, data: Partial<StudentInput>) =>
    apiSend<Student>("PUT", `/api/students/${id}`, data),
  remove: (id: number) => apiSend("DELETE", `/api/students/${id}`),
  enroll: (student_id: number, club_id: number) =>
    apiSend<Enrollment>("POST", "/api/enrollments", { student_id, club_id, is_primary: false }),
  unenroll: (student_id: number, club_id: number) =>
    apiSend("DELETE", `/api/enrollments/student/${student_id}/club/${club_id}`),
  importExcel: (file: File) => apiUpload<ImportResult>("/api/students/import", file),
};

export const studentsLinks = {
  exportExcel: "/api/students/export/excel",
  template: "/api/students/template/download",
};
