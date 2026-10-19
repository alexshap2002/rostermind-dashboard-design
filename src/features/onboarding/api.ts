import { apiGet, apiSend } from "../../lib/api";

/** Форма відповіді GET /api/onboarding/status (app/api/onboarding.py). */
export type Severity = "critical" | "warning" | "info";

export interface WnStep {
  key: string;
  done: boolean;
  count: number;
  /** Лише в admin_telegram: чи збережено chat ID для тесту каналу. */
  chat?: boolean;
}

export interface WnIssue {
  key: string;
  severity: Severity;
  count: number;
  examples: string[];
}

export interface WnStatus {
  steps: WnStep[];
  optional_steps: WnStep[];
  issues: WnIssue[];
  next_lesson: {
    club: string | null;
    group: string | null;
    start_at: string;
    notify_at: string;
    teachers_only: boolean;
    recipients: { name: string; telegram: boolean }[];
  } | null;
  recent: { sent: number; completed: number; missed: number; failed: number } | null;
  telegram_teachers: { id: number; name: string }[];
  partial: boolean;
}

export const onboardingQueries = {
  // Під префіксом ["dashboard"]: мутації учнів/вчителів/розкладу вже інвалідовують його.
  status: () => ({
    queryKey: ["dashboard", "onboarding"] as const,
    queryFn: () => apiGet<WnStatus>("/api/onboarding/status"),
  }),
};

export const onboardingApi = {
  /** Тест каналу адміністратора — на збережений chat ID (як «Тест каналу»). */
  testAdmin: () => apiSend<{ message: string }>("POST", "/api/automations/telegram-notifications/test", {}),
  /** «🧪 Тестове сповіщення вчителю» — справжнє повідомлення вибраному вчителю. */
  testTeacher: (teacherId: number) =>
    apiSend<{ success: boolean }>("POST", `/api/teacher-notifications/${teacherId}/test`),
};
