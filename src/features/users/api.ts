import { apiGet, apiSend } from "../../lib/api";

export type UserRole = "owner" | "admin" | "teacher" | "super_admin";

export interface UserAccount {
  id: number;
  login: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  tenant_id: number | null;
  teacher_id: number | null;
}

export interface UserInput {
  email: string;
  full_name: string;
  password?: string;
  role: UserRole;
  teacher_id?: number | null;
  is_active?: boolean;
}

export const usersQueries = {
  list: () => ({
    queryKey: ["users", "list"] as const,
    queryFn: () => apiGet<UserAccount[]>("/api/users"),
  }),
};

export const usersApi = {
  create: (data: Required<Pick<UserInput, "email" | "full_name" | "password" | "role">> & Pick<UserInput, "teacher_id">) =>
    apiSend<UserAccount>("POST", "/api/users", data),
  update: (id: number, data: Partial<UserInput>) =>
    apiSend<UserAccount>("PUT", `/api/users/${id}`, data),
  remove: (id: number) => apiSend<void>("DELETE", `/api/users/${id}`),
};

export const usersLinks = {
  exportExcel: "/api/users/export/excel",
};
