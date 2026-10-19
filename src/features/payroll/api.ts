import { apiGet, apiSend } from "../../lib/api";

export type PayrollBasis = "AUTO" | "MANUAL";

export interface PayrollRecord {
  id: number;
  teacher_id: number;
  teacher_name: string;
  lesson_event_id: number | null;
  lesson_date: string | null;
  club_name: string | null;
  basis: PayrollBasis;
  amount_decimal: string;
  note: string | null;
  created_at: string;
}

export interface PayrollInput {
  teacher_id: number;
  accrual_date?: string | null;
  basis: PayrollBasis;
  amount_decimal: number;
  note?: string | null;
}

export interface PayrollFilters {
  teacherId?: string;
  basis?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

function qs(filters: PayrollFilters) {
  const params = new URLSearchParams();
  if (filters.teacherId) params.set("teacher_id", filters.teacherId);
  if (filters.basis) params.set("basis", filters.basis);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  params.set("limit", String(filters.limit ?? 2000));
  return params.toString();
}

export const payrollQueries = {
  list: (filters: PayrollFilters) => ({
    queryKey: ["payroll", "list", filters] as const,
    queryFn: () => apiGet<PayrollRecord[]>(`/api/payroll?${qs(filters)}`),
  }),
};

export const payrollApi = {
  create: (data: PayrollInput) => apiSend<PayrollRecord>("POST", "/api/payroll", data),
  update: (id: number, data: Partial<PayrollInput>) =>
    apiSend<PayrollRecord>("PUT", `/api/payroll/${id}`, data),
  remove: (id: number) => apiSend<Record<string, string>>("DELETE", `/api/payroll/${id}`),
};

export function payrollExportUrl(filters: PayrollFilters) {
  const params = new URLSearchParams();
  if (filters.teacherId) params.set("teacher_id", filters.teacherId);
  if (filters.dateFrom) params.set("start_date", filters.dateFrom);
  if (filters.dateTo) params.set("end_date", filters.dateTo);
  const suffix = params.toString();
  return `/api/payroll/export/excel${suffix ? `?${suffix}` : ""}`;
}
