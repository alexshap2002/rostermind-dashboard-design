import { apiGet, apiSend } from "../../lib/api";

export type PayRateType = "PER_LESSON" | "PER_PRESENT";

export interface PayRate {
  id: number;
  teacher_id: number;
  teacher_name: string;
  rate_type: PayRateType;
  amount_decimal: string;
  active_from: string;
  active_to: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PayRateInput {
  teacher_id: number;
  rate_type: PayRateType;
  amount_decimal: number;
  active_from: string;
  active_to?: string | null;
}

export const payRatesQueries = {
  list: (teacherId?: string) => ({
    queryKey: ["pay-rates", "list", teacherId ?? "all"] as const,
    queryFn: () =>
      apiGet<PayRate[]>(`/api/pay_rates${teacherId ? `?teacher_id=${teacherId}` : ""}`),
  }),
};

export const payRatesApi = {
  create: (data: PayRateInput) => apiSend<PayRate>("POST", "/api/pay_rates", data),
  update: (id: number, data: Partial<PayRateInput>) =>
    apiSend<PayRate>("PUT", `/api/pay_rates/${id}`, data),
  remove: (id: number) => apiSend<Record<string, string>>("DELETE", `/api/pay_rates/${id}`),
};
