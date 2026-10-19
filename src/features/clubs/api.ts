import { apiGet, apiSend, apiUpload } from "../../lib/api";
import type { Club, Enrollment } from "../students/types";
import type { Schedule } from "../teachers/types";

export interface ClubInput {
  name: string;
  duration_min: number;
  location: string;
}

/** Відповідь POST /api/clubs/import (ImportClubsResponse на бекенді). */
export interface ClubImportResult {
  created_count: number;
  skipped_count: number;
  errors: string[];
}

export const clubsQueries = {
  list: () => ({
    queryKey: ["clubs", "list"] as const,
    queryFn: () => apiGet<Club[]>("/api/clubs"),
  }),
  enrollments: () => ({
    queryKey: ["enrollments", "list"] as const,
    queryFn: () => apiGet<Enrollment[]>("/api/enrollments"),
  }),
  schedules: () => ({
    queryKey: ["schedules", "list"] as const,
    queryFn: () => apiGet<Schedule[]>("/api/schedules"),
  }),
};

export const clubsApi = {
  create: (data: ClubInput) => apiSend<Club>("POST", "/api/clubs", data),
  update: (id: number, data: Partial<ClubInput>) => apiSend<Club>("PUT", `/api/clubs/${id}`, data),
  remove: (id: number) => apiSend("DELETE", `/api/clubs/${id}`),
  importExcel: (file: File) => apiUpload<ClubImportResult>("/api/clubs/import", file),
};

export const clubsLinks = {
  exportExcel: "/api/clubs/export/excel",
  template: "/api/clubs/template",
};
