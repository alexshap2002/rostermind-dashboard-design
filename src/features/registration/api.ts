import { apiGet, apiSend } from "../../lib/api";

/* ── Запрошення вчителів (app/api/teacher_registration.py, admin_router) ── */
export interface TeacherInviteState {
  status: "missing" | "active" | "expired" | "revoked" | string;
  is_active: boolean;
  telegram_deep_link: string | null;
  expires_at: string | null;
  created_at: string | null;
  last_used_at: string | null;
  use_count: number;
  link_error: string | null;
}

/* Самостійна реєстрація дітей батьками вимкнена (STUDENT_REGISTRATION_ENABLED),
   бекенд не реєструє /api/student-registration/*, тож клієнта до неї теж немає. */

export const registrationQueries = {
  teacherInvite: () => ({
    queryKey: ["teacher-invite"] as const,
    queryFn: () => apiGet<TeacherInviteState>("/api/teachers/invite-link"),
  }),
};

export const registrationApi = {
  createOrRotateInvite: () => apiSend<TeacherInviteState>("POST", "/api/teachers/invite-link", {}),
  revokeInvite: () => apiSend<TeacherInviteState>("POST", "/api/teachers/invite-link/revoke", {}),
};

export const registrationLinks = {
  teacherInviteQr: "/api/teachers/invite-link/qr",
};
