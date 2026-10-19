/** Кабінет власника платформи (super_admin): `/api/super-admin/*`. */
import { apiGet, apiSend, getCurrentSession } from "../../lib/api";

export interface PlatformOwner {
  account_id: number;
  login: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  /** Скільки філій у мережі цього власника. */
  branches: number;
}

/** Умови оплати: `tariff` — 599/999 за дітьми, `custom` — своя сума, `free` — безкоштовно. */
export type PriceMode = "tariff" | "custom" | "free";

export interface PlatformTenant {
  tenant_id: number;
  name: string;
  slug: string;
  is_demo: boolean;
  lifecycle_status: string;
  has_subscription: boolean;
  plan_code: string | null;
  subscription_status: string | null;
  paid_until: string | null;
  students: number;
  teachers: number;
  teachers_in_telegram: number;
  /** Ціна на місяць з урахуванням умов — та сама, що бачить власник у «Філії й оплата». */
  price_uah: number;
  price_mode: PriceMode;
  /** Чому своя сума чи «безкоштовно» — видно лише в кабінеті платформи. */
  price_reason: string | null;
  owner: PlatformOwner | null;
}

export interface PlatformEvent {
  at: string;
  action: string;
  tenant_id: number | null;
  tenant_name: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** Дія зі старого кабінету (`billing_overrides`). */
  legacy: boolean;
}

/** «Безпека»: власний обліковий запис super_admin. */
export interface PlatformSecurity {
  login: string;
  totp_enabled: boolean;
  backup_codes_left: number;
  /** У env `SUPERADMIN_TOTP_DISABLED=true`: вхід без коду, аварійний режим. */
  totp_bypassed: boolean;
}

export interface TotpSetup {
  /** Ключ для ручного введення в застосунок, якщо QR не сканується. */
  secret: string;
  otpauth_uri: string;
  qr_svg: string;
}

export const platformQueries = {
  session: () => ({ queryKey: ["platform", "session"] as const, queryFn: getCurrentSession, retry: false }),
  me: () => ({ queryKey: ["platform", "me"] as const, queryFn: () => apiGet<PlatformSecurity>("/api/super-admin/me") }),
  tenants: () => ({
    queryKey: ["platform", "tenants"] as const,
    queryFn: () => apiGet<{ rows: PlatformTenant[] }>("/api/super-admin/tenants").then((r) => r.rows),
  }),
  activity: (tenantId?: number) => ({
    queryKey: ["platform", "activity", tenantId ?? "all"] as const,
    queryFn: () =>
      apiGet<{ rows: PlatformEvent[] }>(`/api/super-admin/activity${tenantId ? `?tenant_id=${tenantId}` : ""}`).then((r) => r.rows),
  }),
};

export interface CreatedTenant {
  tenant_id: number;
  name: string;
  slug: string;
  login: string;
  /** Показується один раз: ніде не зберігається відкритим. */
  password: string;
}

/** «Додати заклад власнику»: пароля немає — власник входить своїм. */
export interface AddedTenant {
  tenant_id: number;
  name: string;
  slug: string;
  owner_login: string;
  owner_name: string;
  /** Скільки закладів у мережі тепер. */
  branches: number;
  price_mode: PriceMode;
  /** Своя сума, якщо перейшла з мережі. */
  price_amount_uah: number | null;
  price_reason: string | null;
}

/** Тимчасовий пароль власника — показується один раз. */
export interface OwnerTempPassword {
  login: string;
  full_name: string;
  password: string;
  /** У скількох закладах змінився пароль. */
  branches: number;
}

export const platformApi = {
  resetOwnerPassword: (accountId: number, code: string) =>
    apiSend<OwnerTempPassword>("POST", `/api/super-admin/owners/${accountId}/temp-password`, { code }),
  updateOwnerContacts: (accountId: number, fullName: string, phone: string) =>
    apiSend<{ full_name: string; phone: string | null; changed: boolean }>("PUT", `/api/super-admin/owners/${accountId}`, {
      full_name: fullName,
      phone: phone.trim() || null,
    }),
  addTenantToOwner: (accountId: number, body: { name: string; paid_until: string }) =>
    apiSend<AddedTenant>("POST", `/api/super-admin/owners/${accountId}/tenants`, body),
  setPriceTerms: (tenantIds: number[], mode: PriceMode, amountUah: number | null, reason: string) =>
    apiSend<{ updated: number[] }>("POST", "/api/super-admin/subscriptions/price-terms", {
      tenant_ids: tenantIds,
      mode,
      amount_uah: amountUah,
      reason: reason.trim() || null,
    }),
  createTenant: (body: { name: string; owner_login: string; paid_until: string; owner_full_name: string | null; owner_phone: string | null }) =>
    apiSend<CreatedTenant>("POST", "/api/super-admin/tenants", body),
  extend: (tenantIds: number[], paidUntil: string, reason: string) =>
    apiSend<{ updated: number[] }>("POST", "/api/super-admin/subscriptions/extend", {
      tenant_ids: tenantIds,
      paid_until: paidUntil,
      reason: reason.trim() || null,
    }),
  totpSetup: () => apiSend<TotpSetup>("POST", "/api/super-admin/me/totp/setup"),
  totpEnable: (code: string) => apiSend<{ backup_codes: string[] }>("POST", "/api/super-admin/me/totp/enable", { code }),
  totpDisable: (code: string) => apiSend<{ ok: boolean }>("POST", "/api/super-admin/me/totp/disable", { code }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiSend<{ ok: boolean }>("POST", "/api/super-admin/me/password", {
      current_password: currentPassword,
      new_password: newPassword,
    }),
};

/** Підписи дій журналу платформи — людською мовою. */
export const ACTION_LABELS: Record<string, string> = {
  extend: "Продовжено оплату",
  create_tenant: "Створено заклад",
  add_branch: "Додано заклад власнику",
  price_terms: "Змінено умови оплати",
  owner_password_reset: "Тимчасовий пароль власнику",
  owner_contacts: "Змінено ім'я чи телефон власника",
  login: "Вхід у кабінет",
  totp_enabled: "Увімкнено код входу",
  totp_disabled: "Вимкнено код входу",
  password_changed: "Змінено пароль кабінету",
  update_subscription: "Змінено підписку (старий кабінет)",
  set_price_override: "Ручна ціна",
  clear_price_override: "Скасовано ручну ціну",
  update_tenant_lifecycle: "Змінено стан закладу",
  reset_past_due: "Скинуто прострочку (старий кабінет)",
  update_plan_catalog: "Правка тарифу (старий кабінет)",
};

export type SchoolTone = "create" | "update" | "enroll" | "delete" | "neutral";
export interface SchoolStatus {
  label: string;
  tone: SchoolTone;
  /** Терміновість для сортування: 0 — найперше. */
  rank: number;
}
