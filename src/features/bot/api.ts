import { apiGet, apiSend } from "../../lib/api";

export interface BotScheduleInfo {
  id: number;
  club_name: string;
  teacher_name: string;
  teacher_names: string[];
  weekday: number;
  start_time: string;
  group_name: string | null;
  active: boolean;
}

export interface BotSchedule {
  id: number;
  schedule_id: number;
  enabled: boolean;
  offset_minutes: number;
  custom_time: string | null;
  custom_message: string | null;
  notification_time_description: string;
  status_description: string;
  created_at: string;
  updated_at: string;
  schedule: BotScheduleInfo;
}

export interface AvailableSchedule extends BotScheduleInfo {
  has_bot_schedule: boolean;
}

export interface BotScheduleInput {
  schedule_id: number;
  enabled: boolean;
  offset_minutes: number;
  custom_time?: string | null;
  custom_message?: string | null;
}

export const botQueries = {
  schedules: () => ({
    queryKey: ["bot", "schedules"] as const,
    queryFn: () => apiGet<BotSchedule[]>("/api/bot/schedules"),
  }),
  availableSchedules: () => ({
    queryKey: ["bot", "available-schedules"] as const,
    queryFn: () => apiGet<AvailableSchedule[]>("/api/bot/available-schedules"),
  }),
};

export const botApi = {
  create: (data: BotScheduleInput) => apiSend<BotSchedule>("POST", "/api/bot/schedules", data),
  update: (id: number, data: Partial<Omit<BotScheduleInput, "schedule_id">>) =>
    apiSend<BotSchedule>("PUT", `/api/bot/schedules/${id}`, data),
  remove: (id: number) => apiSend<void>("DELETE", `/api/bot/schedules/${id}`),
  checkNotifications: () =>
    apiSend<{ notifications_sent: number; message: string }>("POST", "/api/bot/check-notifications"),
  generateDailyEvents: () =>
    apiSend<{ events_created: number; message: string }>("POST", "/api/bot/generate-daily-events"),
};
