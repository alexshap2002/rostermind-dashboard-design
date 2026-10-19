/** Форматування під uk-UA. */

const UA_MONTHS_SHORT = [
  "Січ", "Лют", "Бер", "Кві", "Тра", "Чер",
  "Лип", "Сер", "Вер", "Жов", "Лис", "Гру",
];
const UA_MONTHS_FULL = [
  "січень", "лютий", "березень", "квітень", "травень", "червень",
  "липень", "серпень", "вересень", "жовтень", "листопад", "грудень",
];

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("uk-UA").format(value);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value);
}

/** "2026-06" → "Чер". */
export function monthShortFromKey(key: string): string {
  const m = Number(key.split("-")[1]);
  return UA_MONTHS_SHORT[m - 1] ?? key;
}

/** Місяць+рік повністю: (2026, 6) → "червень 2026". */
export function monthYearFull(year: number, monthIndex0: number): string {
  return `${UA_MONTHS_FULL[monthIndex0]} ${year}`;
}

/** Дата+час "оновлено DD.MM.YYYY о HH:MM" з ISO-рядка. */
export function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} о ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** ISO date-time → "DD.MM.YYYY, HH:MM" in the browser's local timezone. */
export function formatDateTimeUk(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function roleLabel(role: string): string {
  switch (role) {
    case "owner": return "Власник";
    case "admin": return "Адміністратор";
    case "teacher": return "Вчитель";
    case "super_admin": return "Супер-адміністратор";
    default: return role;
  }
}

/** "через N хв / N год" від часу "HH:MM" сьогодні. null якщо вже минуло. */
export function etaFromTime(hhmm: string): { label: string; soon: boolean } | null {
  const [h, m] = hhmm.split(":").map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  const diffMin = Math.round((target.getTime() - now.getTime()) / 60000);
  if (diffMin < 0) return null;
  if (diffMin < 60) return { label: `через ${diffMin} хв`, soon: diffMin <= 60 };
  const hours = (diffMin / 60).toFixed(1).replace(".0", "").replace(".", ",");
  return { label: `через ${hours} год`, soon: false };
}

/** ISO-дата "2014-04-19" → "19.04.2014". Некоректне значення повертається як є. */
export function formatDateUk(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Український відмінок для віку: 1 рік, 3 роки, 12 років. */
export function ageUk(age: number): string {
  const mod10 = age % 10;
  const mod100 = age % 100;
  if (mod10 === 1 && mod100 !== 11) return `${age} рік`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${age} роки`;
  return `${age} років`;
}

/** Відмінок за числом: pluralUk(3, "гурток", "гуртки", "гуртків") → "гуртки". */
export function pluralUk(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** ISO-момент уроку → "Чт, 08.10 о 16:05" за київським часом (уроки ведуться в Україні). */
export function formatLessonMomentUk(iso: string): string {
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso))) {
    parts[part.type] = part.value;
  }
  const weekday = parts.weekday ? parts.weekday[0].toUpperCase() + parts.weekday.slice(1) : "";
  return `${weekday}, ${parts.day}.${parts.month} о ${parts.hour}:${parts.minute}`;
}

/** "+380971000819" → "+380 97 100 08 19"; інші формати — без змін. */
export function formatPhoneUk(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/[\s\-()]/g, "");
  const m = digits.match(/^\+?38(0\d{2})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+38 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

/** 84.2 → «84,2%»; null (уроків не було) → «—». */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${new Intl.NumberFormat("uk-UA", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value))}%`;
}

/** Різниця у відсоткових пунктах: 2.1 → «+2,1 в.п.», -1.4 → «−1,4 в.п.». */
export function formatPp(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  const abs = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(n));
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${abs} в.п.`;
}

/** "2026-09-22" → «22.09». */
export function formatDayMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}` : iso;
}

/** Межі періоду: «22–28.09», «29.09–05.10», «01.09–30.09.2026» (з роком, якщо withYear). */
export function formatRangeShort(from: string, to: string, withYear = false): string {
  const [fy, fm, fd] = from.slice(0, 10).split("-");
  const [ty, tm, td] = to.slice(0, 10).split("-");
  const tail = withYear ? `.${ty}` : "";
  if (from.slice(0, 10) === to.slice(0, 10)) return `${fd}.${fm}${tail}`;
  if (fm === tm && fy === ty) return `${fd}–${td}.${tm}${tail}`;
  return `${fd}.${fm}${withYear && fy !== ty ? `.${fy}` : ""}–${td}.${tm}${tail}`;
}
