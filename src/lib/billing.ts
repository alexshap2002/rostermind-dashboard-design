/** Оплата філій: спільне для «Філій й оплати» (власник мережі) і кабінету платформи (super_admin). */
import { formatCurrency, formatNumber, pluralUk } from "./format";

export const SMALL_MAX_KIDS = 70;
export const SOON_DAYS = 7;
export const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
export const days = (n: number) => `${formatNumber(n)} ${pluralUk(n, "день", "дні", "днів")}`;
export const kids = (n: number) => `${formatNumber(n)} ${pluralUk(n, "дитина", "дитини", "дітей")}`;
export const hrn = (n: number) => `${formatCurrency(n)} ₴`;
/** Ціна за тарифом (як `branch_monthly_price_uah` без особливих умов): 599 ₴ до 70 дітей, 999 ₴ понад 70. */
export const tariffPrice = (students: number) => (students > SMALL_MAX_KIDS ? 999 : 599);

/** Днів до «оплачено до» (включно): 0 — сьогодні останній оплачений день, від'ємне — прострочено. */
export function daysLeft(paidUntil: string): number {
  return Math.round((Date.parse(`${paidUntil}T12:00:00Z`) - Date.parse(`${todayIso()}T12:00:00Z`)) / 86_400_000);
}

export type PayTone = "ok" | "soon" | "overdue";
export function payTone(paidUntil: string): PayTone {
  const left = daysLeft(paidUntil);
  return left < 0 ? "overdue" : left <= SOON_DAYS ? "soon" : "ok";
}
export function paidNote(paidUntil: string): string {
  const left = daysLeft(paidUntil);
  if (left < 0) return `прострочено на ${days(-left)}`;
  if (left === 0) return "сьогодні останній день";
  return `ще ${days(left)}`;
}
