import type { QueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "../../lib/api";
import type { CriteriaList, CriteriaMarks } from "./types";

const BASE = "/api/vulnerability-criteria";

export const criteriaQueries = {
  list: () => ({
    queryKey: ["vulnerability-criteria", "list"] as const,
    queryFn: () => apiGet<CriteriaList>(BASE),
  }),
  marks: () => ({
    queryKey: ["vulnerability-criteria", "marks"] as const,
    queryFn: () => apiGet<CriteriaMarks>(`${BASE}/marks`),
  }),
};

/** Кожна мутація повертає свіжий список — його й кладемо в кеш. */
export const criteriaApi = {
  create: (name: string) => apiSend<CriteriaList>("POST", BASE, { name }),
  rename: (id: number, name: string) => apiSend<CriteriaList>("PUT", `${BASE}/${id}`, { name }),
  move: (id: number, direction: "up" | "down") => apiSend<CriteriaList>("POST", `${BASE}/${id}/move`, { direction }),
  restoreStandard: () => apiSend<CriteriaList>("POST", `${BASE}/restore-standard`),
  remove: (id: number, moveTo?: number) =>
    apiSend<CriteriaList>("DELETE", `${BASE}/${id}${moveTo ? `?move_to=${moveTo}` : ""}`),
};

/** Після зміни списку чи позначок: критерії, учні (фільтр) і головна (плитка). */
export function invalidateCriteria(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["vulnerability-criteria"] });
  qc.invalidateQueries({ queryKey: ["students"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
}

/** Мапа позначок з ключами-числами. */
export function marksByStudent(data: CriteriaMarks | undefined): Map<number, number[]> {
  return new Map(Object.entries(data?.marks ?? {}).map(([sid, ids]) => [Number(sid), ids]));
}
