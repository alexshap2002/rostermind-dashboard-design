import { formatNumber, pluralUk } from "../../lib/format";
import type { BranchRow } from "./api";

/** Що відкриває бічна панель: показник (з філією чи без) або огляд філії. */
export type PanelKind = "students" | "new" | "lessons" | "attendance" | "payroll" | "unmarked" | "today" | "attention" | "branch";
export interface Panel { kind: PanelKind; branch: number | null; scope: "period" | "now" }

export const PANEL_KINDS: PanelKind[] = ["students", "new", "lessons", "attendance", "payroll", "unmarked", "today", "attention", "branch"];

/** Підсумок мережі з рядків філій. Відвідуваність — присутні / очікувані по всіх філіях,
    а не середнє відсотків: філія з 300 дітьми важить більше за філію з 30. */
export function networkTotals(rows: BranchRow[]) {
  const sum = (key: keyof BranchRow) => rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
  const present = sum("present_students");
  const total = sum("total_students");
  return {
    students_total: sum("students_total"),
    students_new: sum("students_new"),
    lessons_scheduled: sum("lessons_scheduled"),
    lessons_completed: sum("lessons_completed"),
    lessons_unmarked_overdue: sum("lessons_unmarked_overdue"),
    lessons_upcoming: sum("lessons_upcoming"),
    lessons_cancelled: sum("lessons_cancelled"),
    present_students: present,
    total_students: total,
    attendance_rate_pct: total ? Math.round((present / total) * 1000) / 10 : null,
    payroll_uah: sum("payroll_uah"),
  };
}

const fmt1 = (v: number) => Math.abs(v).toLocaleString("uk-UA", { maximumFractionDigits: 1 });

/** Зміна з текстом і стрілкою — не лише кольором. tone: good — зростання добре (відвідуваність),
    neutral — зростання не є успіхом саме по собі (витрати на зарплати). */
export function Delta({ value, unit, tone = "good", suffix }: {
  value: number | null | undefined; unit: "pp" | "pct"; tone?: "good" | "neutral"; suffix?: string;
}) {
  if (value === null || value === undefined) return null;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "";
  const cls = tone === "neutral" || value === 0 ? "nd-delta" : value > 0 ? "nd-delta ok" : "nd-delta risk";
  const text = `${sign}${fmt1(value)}${unit === "pp" ? " в.п." : "%"}`;
  return (
    <span className={cls}>
      {arrow && <span aria-hidden="true">{arrow} </span>}
      {text}
      {suffix && <span className="nd-delta-sfx"> {suffix}</span>}
    </span>
  );
}

export const countLessons = (n: number) => `${formatNumber(n)} ${pluralUk(n, "урок", "уроки", "уроків")}`;

/** Слово й тон сигналу за його severity — однакові в «На зараз», таблиці філій і бічній панелі,
    щоб один і той самий сигнал не звався в одному місці «Ризик», а в іншому «Важливо». */
export function severityTag(severity: string): { label: string; tone: "risk" | "warn" | "info" } {
  if (severity === "critical" || severity === "high") return { label: "Ризик", tone: "risk" };
  if (severity === "low" || severity === "info") return { label: "Інфо", tone: "info" };
  return { label: "Увага", tone: "warn" };
}

/** Порядок сигналів: спершу найважливіші. */
export const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, warning: 2, medium: 3, low: 4, info: 5 };
