import { apiGet, apiSend } from "../../lib/api";

export interface AuditLog {
  id: number;
  timestamp: string;
  user_name: string;
  action_type: string;
  entity_type: string;
  entity_id: number | null;
  entity_name: string | null;
  description: string;
  changes_json: Record<string, unknown> | null;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AuditStats {
  period_days: number;
  total_logs: number;
  actions: Record<string, number>;
  entities: Record<string, number>;
}

export interface AuditFilters {
  page: number;
  pageSize: number;
  search?: string;
  actionType?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
}

function qs(filters: AuditFilters) {
  const params = new URLSearchParams({
    page: String(filters.page),
    page_size: String(filters.pageSize),
  });
  if (filters.search) params.set("search", filters.search);
  if (filters.actionType) params.set("action_type", filters.actionType);
  if (filters.entityType) params.set("entity_type", filters.entityType);
  if (filters.dateFrom) params.set("date_from", `${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) params.set("date_to", `${filters.dateTo}T00:00:00`);
  return params.toString();
}

export const auditQueries = {
  logs: (filters: AuditFilters) => ({
    queryKey: ["audit", "logs", filters] as const,
    queryFn: () => apiGet<AuditLogsResponse>(`/api/audit/logs?${qs(filters)}`),
  }),
  stats: () => ({
    queryKey: ["audit", "stats"] as const,
    queryFn: () => apiGet<AuditStats>("/api/audit/stats?days=30"),
  }),
};

export const auditApi = {
  deleteOld: (days: number) =>
    apiSend<{ deleted_count: number; message: string }>("DELETE", `/api/audit/logs/old?days=${days}`),
  /** Повний відфільтрований набір для CSV-експорту: API віддає ≤ 200 записів на сторінку — збираємо всі. */
  exportRows: async (filters: AuditFilters) => {
    const rows: AuditLog[] = [];
    for (let page = 1; ; page++) {
      const r = await apiGet<AuditLogsResponse>(`/api/audit/logs?${qs({ ...filters, page, pageSize: 200 })}`);
      rows.push(...r.logs);
      if (page >= r.total_pages) return rows;
    }
  },
};
