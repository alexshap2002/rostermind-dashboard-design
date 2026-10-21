import { formatNumber, pluralUk } from "../../lib/format";
import type { AttentionItem, BranchRow } from "./api";

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

/** Сигнали уваги за період: масив — завантажено; інакше стан запиту («ще вантажиться», «не завантажено»,
    «сервер не віддає»). Поки сигналів немає, «усе гаразд» казати не можна — це не нуль. */
export type SignalsState = AttentionItem[] | "loading" | "error" | "off";

/** Який показник відкриває сигнал: падіння відвідуваності й часті пропуски — «Відвідуваність», решта — список сигналів. */
export function signalPanelKind(it: AttentionItem): PanelKind {
  return it.anomaly_type === "ATTENDANCE_DROP" || it.anomaly_type === "CHRONIC_ABSENCE_CLUSTER" ? "attendance" : "attention";
}

/** Тон сигналу: критичні й високі — ризик, решта — увага. */
export function signalTone(it: AttentionItem): "warn" | "risk" {
  return it.severity === "critical" || it.severity === "high" ? "risk" : "warn";
}

/** «+N нових» — кнопка до розбивки нових дітей; «нових немає» — та сама кнопка з нулем рядків. */
export function NewChip({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button type="button" className={`nd-chip-new${count > 0 ? "" : " zero"}`} onClick={onOpen}>
      {count > 0 ? `+${formatNumber(count)} нових` : "нових немає"}
    </button>
  );
}

/** Стан відміток для рядка занять. «Усі відмічено» — лише коли є проведені заняття без прострочених;
    без занять у періоді — «занять не було»; коли все ще попереду — нічого (досить «N попереду»). */
export function marksText(r: { lessons_scheduled: number; lessons_completed: number; lessons_unmarked_overdue: number }): string | null {
  if (r.lessons_scheduled === 0) return "занять не було";
  if (r.lessons_unmarked_overdue > 0) return `${formatNumber(r.lessons_unmarked_overdue)} не відмічено`;
  return r.lessons_completed > 0 ? "усі відмічено" : null;
}
