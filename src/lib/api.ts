/** Тонка обгортка над fetch. Кука auth-сесії йде автоматично (same-origin через Vite proxy). */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function throwApiError(res: Response): Promise<never> {
  let detail = res.statusText;
  try {
    const data = await res.json();
    if (typeof data.detail === "string") detail = data.detail;
    else if (typeof data.message === "string") detail = data.message; // формат teacher/student-registration
    else if (data.detail) detail = JSON.stringify(data.detail);
  } catch {
    /* not json */
  }
  throw new ApiError(res.status, detail);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<T>;
}

/** Завантажити файл (Excel тощо): помилка — читабельна, а не сирий JSON у вкладці;
    ім'я файлу — з filename* (кирилиця), інакше з filename. */
export async function apiDownload(path: string, fallbackName = "report.xlsx"): Promise<void> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) await throwApiError(res);
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="([^"]+)"/i)?.[1];
  const name = encoded ? decodeURIComponent(encoded) : plain ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** JSON-мутації: POST/PUT/DELETE. DELETE з 204 повертає undefined. */
export function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function apiSend<T = void>(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  operation?: { idempotencyKey?: string; correlationId?: string },
): Promise<T> {
  const idempotencyKey = operation?.idempotencyKey ?? newRequestId();
  const correlationId = operation?.correlationId ?? newRequestId();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Idempotency-Key": idempotencyKey,
    "X-Correlation-Id": correlationId,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) await throwApiError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Завантаження файлу (multipart) — для імпорту Excel. */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) await throwApiError(res);
  return res.json() as Promise<T>;
}

export interface BillingRecoveryState {
  recovery_required: true;
  challenge_token: string;
  expires_at: string;
  branches: Array<{
    tenant_id: number;
    tenant_name: string;
    subscription_status: "pending_payment" | "past_due";
  }>;
}

/** super_admin з увімкненим кодом: після пароля — ще код із застосунку (`POST /auth/totp`). */
export interface SecondFactorState {
  second_factor_required: true;
  challenge: string;
}

export type LoginResult = { access_token: string; token_type: string } | BillingRecoveryState | SecondFactorState;

export interface CurrentSession {
  id: number;
  login: string;
  role: string;
  full_name: string;
  tenant_id: number | null;
  redirect_url: string;
}

/** Логін через form-urlencoded (контракт існуючого бекенду POST /auth/login). */
export async function login(username: string, password: string): Promise<LoginResult> {
  const res = await fetch("/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }),
  });
  if (!res.ok) {
    let detail = "Не вдалося увійти";
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<LoginResult>;
}

/** Другий крок входу: код із застосунку або резервний код. */
export function loginSecondFactor(challenge: string, code: string) {
  return apiSend<{ access_token: string; token_type: string }>("POST", "/auth/totp", { challenge, code });
}

export async function getCurrentSession(): Promise<CurrentSession> {
  return apiGet<CurrentSession>("/auth/me");
}

export async function requestBillingRecoveryCheckout(challengeToken: string, tenantId: number) {
  return apiSend<{
    success: boolean;
    tenant_id: number;
    tenant_name: string;
    subscription_status: string;
    checkout: { provider: string; mode: string; data: string; signature: string };
  }>("POST", "/auth/owner/recovery-checkout", {
    challenge_token: challengeToken,
    tenant_id: tenantId,
  });
}

/** Logout: бекенд віддає 302 на Jinja-сторінку — не йдемо за редіректом. */
export async function logout(): Promise<void> {
  await fetch("/auth/logout", {
    method: "POST",
    credentials: "include",
    redirect: "manual",
  }).catch(() => undefined);
}
