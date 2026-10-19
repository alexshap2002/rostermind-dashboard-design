/** Стан закладу в реєстрі платформи, терміновість і тексти для власника. */
import { formatDateUk } from "../../lib/format";
import { hrn, kids, payTone, todayIso } from "../../lib/billing";
import type { PlatformTenant, PriceMode, SchoolStatus } from "./api";

export function schoolStatus(t: PlatformTenant): SchoolStatus {
  if (t.is_demo) return { label: "Демо", tone: "neutral", rank: 6 };
  if (!t.has_subscription) return { label: "Без підписки", tone: "delete", rank: 3 };
  if (t.lifecycle_status === "onboarding") return { label: "Чекає активації", tone: "enroll", rank: 2 };
  if (t.lifecycle_status === "suspended") return { label: "Призупинено", tone: "neutral", rank: 4 };
  // Безкоштовному закладу «оплачено до» не важить: не прострочений і не «скоро оплата».
  if (t.price_mode === "free") return { label: "Безкоштовно", tone: "update", rank: 5 };
  if (t.paid_until && payTone(t.paid_until) === "overdue") return { label: "Прострочено", tone: "delete", rank: 0 };
  if (t.paid_until && payTone(t.paid_until) === "soon") return { label: "Скоро оплата", tone: "enroll", rank: 1 };
  return { label: "Працює", tone: "create", rank: 5 };
}

/** Філії однієї мережі йдуть разом; група стоїть там, де її найтерміновіша філія. */
export function groupSchools(rows: PlatformTenant[]): PlatformTenant[][] {
  const byKey = new Map<string, PlatformTenant[]>();
  for (const t of rows) {
    const key = t.owner && t.owner.branches > 1 ? `net-${t.owner.account_id}` : `one-${t.tenant_id}`;
    byKey.set(key, [...(byKey.get(key) ?? []), t]);
  }
  const byUrgency = (a: PlatformTenant, b: PlatformTenant) =>
    schoolStatus(a).rank - schoolStatus(b).rank ||
    (a.paid_until ?? "9999").localeCompare(b.paid_until ?? "9999") ||
    a.name.localeCompare(b.name, "uk");
  const groups = [...byKey.values()].map((g) => [...g].sort(byUrgency));
  return groups.sort((a, b) => byUrgency(a[0], b[0]));
}

/** +N місяців до дати; 31.01 + 1 міс → 28/29.02. */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Від чого продовжувати: від старого «оплачено до» (навіть простроченого), інакше — від сьогодні. */
export function extendBase(tenants: PlatformTenant[]): string {
  const dates = tenants.map((t) => t.paid_until).filter((d): d is string => !!d).sort();
  return dates.length ? dates[dates.length - 1] : todayIso();
}

/** Умови й ціна людською мовою: «45 дітей → 599 ₴/міс.», «450 ₴/міс. · своя сума», «безкоштовно · Партнер». */
export function priceTermsText(t: PlatformTenant): string {
  if (t.price_mode === "free") return `безкоштовно${t.price_reason ? ` · ${t.price_reason}` : ""}`;
  if (t.price_mode === "custom") return `${hrn(t.price_uah)}/міс. · своя сума${t.price_reason ? ` (${t.price_reason})` : ""}`;
  return `${kids(t.students)} → ${hrn(t.price_uah)}/міс.`;
}

export interface Terms {
  mode: PriceMode;
  /** Своя сума, ₴ на місяць. */
  amount: number | null;
  reason: string | null;
}

/** Умови, що перейдуть на новий заклад мережі (як на сервері): однакові в усіх філій — ті самі, інакше за тарифом. */
export function networkTerms(branches: PlatformTenant[]): Terms {
  const all = branches.filter((t) => t.has_subscription);
  const keys = new Set(all.map((t) => `${t.price_mode}|${t.price_mode === "custom" ? t.price_uah : ""}|${t.price_reason ?? ""}`));
  const first = all[0];
  if (keys.size !== 1 || !first || first.price_mode === "tariff") return { mode: "tariff", amount: null, reason: null };
  return { mode: first.price_mode, amount: first.price_mode === "custom" ? first.price_uah : null, reason: first.price_reason };
}

export function termsText(terms: Terms): string {
  if (terms.mode === "free") return `безкоштовно${terms.reason ? ` · ${terms.reason}` : ""}`;
  if (terms.mode === "custom") return `${hrn(terms.amount ?? 0)}/міс. · своя сума${terms.reason ? ` (${terms.reason})` : ""}`;
  return "за тарифом: 599 ₴ до 70 дітей, 999 ₴ понад 70";
}

export function reminderText(t: PlatformTenant): string {
  const when = t.paid_until ? `Оплачено до ${formatDateUk(t.paid_until)}.` : "Оплату ще не внесено.";
  return `Нагадуємо про оплату RosterMind за «${t.name}»: ${hrn(t.price_uah)} на місяць. ${when}`;
}
