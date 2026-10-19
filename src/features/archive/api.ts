import { apiGet, apiSend } from "../../lib/api";

/** JSON API app/api/archives.py (owner-only). */
export interface ArchiveItem {
  id: number;
  name: string;
  created_at: string;
  created_by_name: string | null;
  counts: Record<string, number>;
  wipe_type: string | null;
}

export interface WipeCategory {
  key: string;
  label: string;
  description: string;
  default: boolean;
}

export interface ArchiveContent {
  id: number;
  name: string;
  created_at: string;
  counts: Record<string, number>;
  sections: {
    students: Record<string, unknown>[];
    teachers: Record<string, unknown>[];
    clubs: Record<string, unknown>[];
    conducted_lessons: Record<string, unknown>[];
    schedules: Record<string, unknown>[];
    audit_logs: Record<string, unknown>[];
  };
  rows_limit: number;
}

export const archiveQueries = {
  list: () => ({
    queryKey: ["archives", "list"] as const,
    queryFn: () => apiGet<ArchiveItem[]>("/api/archives"),
  }),
  wipeOptions: () => ({
    queryKey: ["archives", "wipe-options"] as const,
    queryFn: () => apiGet<WipeCategory[]>("/api/archives/wipe-options"),
  }),
  content: (id: number) => ({
    queryKey: ["archives", "content", id] as const,
    queryFn: () => apiGet<ArchiveContent>(`/api/archives/${id}`),
  }),
};

export const archiveApi = {
  create: (name: string, wipe_type: string, wipe_targets: string[]) =>
    apiSend<ArchiveItem>("POST", "/api/archives", { name, wipe_type, wipe_targets }),
  restore: (id: number) =>
    apiSend<{ success: boolean; restored: Record<string, number> }>("POST", `/api/archives/${id}/restore`),
  remove: (id: number) => apiSend("DELETE", `/api/archives/${id}`),
  upload: async (file: File, name: string) => {
    const form = new FormData();
    form.append("archive_file", file);
    form.append("archive_name", name);
    const res = await fetch("/api/archives/upload", { method: "POST", credentials: "include", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(typeof data.detail === "string" ? data.detail : "Не вдалося завантажити архів");
    }
    return res.json() as Promise<ArchiveItem>;
  },
  downloadUrl: (id: number) => `/admin/archive/${id}/download`,
};
