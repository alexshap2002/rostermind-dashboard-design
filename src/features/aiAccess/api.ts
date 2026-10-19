import { apiGet, apiSend } from "../../lib/api";

/* ── Доступ для AI (app/api/mcp_access.py) ── */
export type AccessMode = "read" | "write";

export interface McpToken {
  id: number;
  label: string;
  status: "active" | "expired" | "revoked";
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number;
  access_mode: AccessMode;
  /** Лише для посилання на зміни: approved — власник підтвердив, pending — поки лише читає. */
  write_status: "approved" | "pending" | null;
  write_approved_at: string | null;
  write_approved_by: string | null;
}

export interface McpTokenList {
  enabled: boolean;
  base_url: string;
  tokens: McpToken[];
}

/** Секрет приходить лише у відповіді на створення — у кеш запитів його не кладемо. */
export interface McpTokenCreated extends McpToken {
  url: string;
  secret: string;
  /** Готовий текст для асистента: посилання, тип підключення і що зробити після. */
  assistant_message: string;
}

export interface McpTokenCreateInput {
  label: string;
  expires_in_days: number | null;
  access_mode: AccessMode;
  /** Власник, що створює посилання на зміни, одразу бере відповідальність. */
  confirm_responsibility: boolean;
}

export interface AiChangePlan {
  summary?: string;
  changes?: unknown;
  effects?: string[];
  warnings?: string[];
  destructive?: boolean;
}

export interface AiChange {
  id: number;
  token_label: string;
  tool: string;
  status: "applied" | "failed" | "pending" | "expired";
  destructive: boolean;
  summary: string | null;
  plan: AiChangePlan;
  result: Record<string, unknown> | null;
  error: string | null;
  human_confirmation: string | null;
  created_at: string;
  applied_at: string | null;
}

export interface AiChangeList {
  items: AiChange[];
  has_more: boolean;
}

export const aiAccessQueries = {
  list: () => ({
    queryKey: ["mcp-tokens"] as const,
    queryFn: () => apiGet<McpTokenList>("/api/mcp-tokens"),
  }),
  changes: (limit: number, appliedOnly: boolean) => ({
    queryKey: ["mcp-tokens", "changes", limit, appliedOnly] as const,
    queryFn: () => apiGet<AiChangeList>(`/api/mcp-tokens/changes?limit=${limit}&applied_only=${appliedOnly}`),
  }),
};

export const aiAccessApi = {
  create: (input: McpTokenCreateInput) => apiSend<McpTokenCreated>("POST", "/api/mcp-tokens", input),
  revoke: (id: number) => apiSend<McpToken>("POST", `/api/mcp-tokens/${id}/revoke`, {}),
  approveWrite: (id: number) =>
    apiSend<McpToken>("POST", `/api/mcp-tokens/${id}/approve-write`, { confirm_responsibility: true }),
  withdrawWrite: (id: number) => apiSend<McpToken>("POST", `/api/mcp-tokens/${id}/withdraw-write`, {}),
};

export const aiAccessLinks = {
  skill: (mode: AccessMode = "read") => `/api/mcp-tokens/skill?mode=${mode}`,
};
