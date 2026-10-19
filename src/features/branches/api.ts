import { apiGet, apiSend } from "../../lib/api";

export interface Branch {
  tenant_id: number;
  tenant_name: string;
  lifecycle_status: "onboarding" | "active" | "suspended" | "archived" | "deleting";
  lifecycle_reason: string | null;
  is_active_context: boolean;
  can_switch: boolean;
  switch_block_reason: string | null;
  capabilities: { can_delete: boolean; delete_block_reason: string | null };
  current_students: number;
  current_active_teachers: number;
  admin_names: string[];
  /** Ціна на місяць: за тарифом 599 ₴ до 70 дітей і 999 ₴ понад 70; або особливі умови від RosterMind */
  monthly_price_uah: number;
  /** `tariff` — за тарифом, `custom` — своя сума, `free` — безкоштовно */
  price_mode: "tariff" | "custom" | "free";
  /** «Оплачено до» включно (YYYY-MM-DD); null — ще не активована */
  paid_until: string | null;
}

export interface BranchesList {
  owner_account_id: number;
  owner_login: string;
  current_tenant_id: number;
  branches: Branch[];
}

export interface LiqpayCheckout {
  provider: string;
  mode: string;
  data: string;
  signature: string;
}

export interface CreateBranchResponse {
  success: boolean;
  tenant_id: number;
  tenant_name: string;
  branch_status: string;
  message: string;
}

export const branchesQueries = {
  list: () => ({
    queryKey: ["owner-branches", "list"] as const,
    queryFn: () => apiGet<BranchesList>("/api/owner/branches"),
  }),
};

export const branchesApi = {
  create: (name: string, idempotencyKey?: string) =>
    apiSend<CreateBranchResponse>(
      "POST",
      "/api/owner/branches",
      { name },
      idempotencyKey ? { idempotencyKey } : undefined,
    ),
  rename: (tenantId: number, name: string) =>
    apiSend<{ success: boolean; tenant_id: number; tenant_name: string }>(
      "POST",
      `/api/owner/branches/${tenantId}/rename`,
      { name },
    ),
  /** Лише для філії, що ще не активована: сервер відмовить для активної. */
  remove: (tenantId: number, confirm_branch_name: string) =>
    apiSend<Record<string, unknown>>("POST", `/api/owner/branches/${tenantId}/delete`, {
      confirm_branch_name,
      confirm_phrase: "ВИДАЛИТИ",
    }),
  switchBranch: (tenantId: number) =>
    apiSend<Record<string, unknown>>("POST", "/auth/owner/switch-branch", { tenant_id: tenantId }),
};

const SWITCH_KEY = "rm.branchSwitch";
const NETWORK_URL_KEY = "rm.networkUrl";

export interface BranchSwitchMark { tenantId: number; tenantName: string; at: number }

export function readBranchSwitch(storage: Storage): BranchSwitchMark | null {
  try {
    const raw = storage.getItem(SWITCH_KEY);
    return raw ? (JSON.parse(raw) as BranchSwitchMark) : null;
  } catch {
    return null;
  }
}

export function forgetBranchSwitch(storage: Storage) {
  try { storage.removeItem(SWITCH_KEY); } catch { /* приватний режим */ }
}

export const BRANCH_SWITCH_KEY = SWITCH_KEY;

/** Куди вести після перемикання: той самий розділ без параметрів (там бувають id з іншої
    філії); зі сторінок мережі — на панель філії. */
export function nextPathAfterSwitch(pathname: string): string {
  return pathname.startsWith("/main-branch") || pathname.startsWith("/branches") ? "/" : pathname;
}

/** Остання адреса «Усієї мережі» з фільтрами — щоб «← Уся мережа» повертала туди ж. */
export function rememberNetworkUrl(url: string) {
  try { sessionStorage.setItem(NETWORK_URL_KEY, url); } catch { /* приватний режим */ }
}

/** Адреса «Усієї мережі» з останніми фільтрами; fresh — оминути 5-хвилинний кеш (у філії щось змінили). */
export function networkHomeHref(fresh = false): string {
  let url = "/main-branch";
  try { url = sessionStorage.getItem(NETWORK_URL_KEY) || url; } catch { /* приватний режим */ }
  return fresh ? `${url}${url.includes("?") ? "&" : "?"}fresh=1` : url;
}

/** Перейти в іншу філію: сервер перевидає сесію, сторінка повністю перезавантажується.
    Ключі кешу не містять філії, тож лише так старі дані не змішаються з новими. */
export async function enterBranch(tenantId: number, tenantName: string, next = "/") {
  await branchesApi.switchBranch(tenantId);
  const mark = JSON.stringify({ tenantId, tenantName, at: Date.now() } satisfies BranchSwitchMark);
  try {
    localStorage.setItem(SWITCH_KEY, mark); // інші вкладки дізнаються з події storage
    sessionStorage.setItem(SWITCH_KEY, mark); // ця вкладка після перезавантаження покаже «Ви у філії …»
  } catch { /* приватний режим — без підказок */ }
  window.location.assign(next);
}

/** LiqPay відкривається у цьому ж вікні, тому браузер не блокує async-checkout як popup. */
export function openLiqpayCheckout(checkout: LiqpayCheckout) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "https://www.liqpay.ua/api/3/checkout";
  form.acceptCharset = "utf-8";
  form.target = "_self";
  for (const [k, v] of Object.entries({ data: checkout.data, signature: checkout.signature })) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = k;
    input.value = v;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

export const PLAN_LABELS: Record<string, string> = {
  free: "Безкоштовний",
  basic: "Базовий",
  pro: "Pro",
  plus: "Plus",
  premium: "Premium",
  enterprise: "Enterprise",
  unknown: "—",
};

export const SUB_STATUS: Record<string, { label: string; tone: "create" | "update" | "enroll" | "delete" | "neutral" }> = {
  active: { label: "Активна", tone: "create" },
  trialing: { label: "Пробний період", tone: "enroll" },
  pending_payment: { label: "Очікує оплати", tone: "enroll" },
  past_due: { label: "Прострочено", tone: "delete" },
  canceled: { label: "Скасовано", tone: "neutral" },
  not_configured: { label: "Не налаштовано", tone: "neutral" },
};
