import { apiGet, apiSend } from "../../lib/api";

export interface TelegramNotificationSetting {
  type: string;
  name: string;
  description: string;
  enabled: boolean;
  requires_time: boolean;
  requires_day: boolean;
  supports_day_selection: boolean;
  trigger_time: string | null;
  trigger_day: number | null;
  trigger_days: number[];
  config: Record<string, unknown>;
}

export interface TelegramNotificationsSettings {
  chat_id: number | null;
  timezone: string;
  notifications: Record<string, TelegramNotificationSetting>;
}

export interface TelegramNotificationPayload {
  enabled: boolean;
  trigger_time?: string | null;
  trigger_day?: number | null;
  trigger_days?: number[] | null;
  config: Record<string, unknown>;
}

export interface TelegramNotificationsUpdate {
  chat_id: number | null;
  notifications: Record<string, TelegramNotificationPayload>;
}

export const adminTelegramQueries = {
  settings: () => ({
    queryKey: ["admin-telegram", "settings"] as const,
    queryFn: () => apiGet<TelegramNotificationsSettings>("/api/automations/telegram-notifications/settings"),
  }),
};

export const adminTelegramApi = {
  update: (data: TelegramNotificationsUpdate) =>
    apiSend<TelegramNotificationsSettings>("PUT", "/api/automations/telegram-notifications/settings", data),
  test: (data: { chat_id?: number | null; notification_type?: string | null }) =>
    apiSend<{ status: string; message: string }>("POST", "/api/automations/telegram-notifications/test", data),
};
