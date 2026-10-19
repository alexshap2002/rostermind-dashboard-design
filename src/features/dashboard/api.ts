import { apiGet } from "../../lib/api";
import type {
  AuditLogsResponse,
  CalendarEvent,
  DashboardCharts,
  DashboardSummary,
} from "./types";

const todayISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const dashboardQueries = {
  summary: () => ({
    queryKey: ["dashboard", "summary"] as const,
    queryFn: () => apiGet<DashboardSummary>("/api/dashboard/summary"),
  }),
  charts: () => ({
    queryKey: ["dashboard", "charts"] as const,
    queryFn: () => apiGet<DashboardCharts>("/api/dashboard/charts"),
  }),
  recentActions: () => ({
    queryKey: ["audit", "recent"] as const,
    queryFn: () => apiGet<AuditLogsResponse>("/api/audit/logs?page=1&page_size=5"),
  }),
  todayEvents: () => ({
    queryKey: ["calendar", "today"] as const,
    queryFn: () => {
      const day = todayISO();
      return apiGet<CalendarEvent[]>(
        `/api/calendar/events?start_date=${day}&end_date=${day}`,
      );
    },
  }),
};
