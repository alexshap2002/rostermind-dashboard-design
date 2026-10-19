import { apiGet, apiSend } from "../../lib/api";

export interface CalendarEvent {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  club_id: number | null;
  club_name: string;
  teacher_id: number;
  teacher_name: string;
  teacher_names: string[];
  status: string;
  schedule_id: number;
}

export interface CalendarException {
  id: number;
  date: string;
  reason: string;
  skip: boolean;
  created_at: string;
}

export interface CalendarFilters {
  startDate: string;
  endDate: string;
  clubId?: string;
  teacherId?: string;
}

function eventsQs(filters: CalendarFilters) {
  const params = new URLSearchParams({
    start_date: filters.startDate,
    end_date: filters.endDate,
  });
  if (filters.clubId) params.set("club_id", filters.clubId);
  if (filters.teacherId) params.set("teacher_id", filters.teacherId);
  return params.toString();
}

export const calendarQueries = {
  events: (filters: CalendarFilters) => ({
    queryKey: ["calendar", "events", filters] as const,
    queryFn: () => apiGet<CalendarEvent[]>(`/api/calendar/events?${eventsQs(filters)}`),
  }),
  exceptions: (startDate: string, endDate: string) => ({
    queryKey: ["calendar", "exceptions", startDate, endDate] as const,
    queryFn: () =>
      apiGet<CalendarException[]>(
        `/api/calendar/exceptions?start_date=${startDate}&end_date=${endDate}`,
      ),
  }),
};

export const calendarApi = {
  cancelEvent: (id: number) =>
    apiSend<{ message: string; new_status: string }>("PUT", `/api/calendar/events/${id}/cancel`),
  restoreEvent: (id: number) =>
    apiSend<{ message: string; new_status: string }>("PUT", `/api/calendar/events/${id}/restore`),
  createExceptions: (data: { start_date: string; end_date: string; reason: string }) =>
    apiSend<CalendarException[]>("POST", "/api/calendar/exceptions", data),
  deleteException: (id: number) =>
    apiSend<{ message: string; events_regenerated: number }>("DELETE", `/api/calendar/exceptions/${id}`),
};
