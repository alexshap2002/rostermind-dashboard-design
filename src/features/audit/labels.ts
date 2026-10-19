/** Українські підписи дій та об'єктів аудиту — 1:1 із legacy (audit.html ACTION_BADGES/ENTITY_NAMES). */

export const ACTION_LABELS: Record<string, string> = {
  CREATE: "Створено",
  UPDATE: "Оновлено",
  DELETE: "Видалено",
  IMPORT: "Імпорт",
  EXPORT: "Експорт",
  RESTORE: "Відновлення",
  ENROLL: "Запис",
  UNENROLL: "Відпис",
  REVOKE: "Відкликано",
};

export const ENTITY_LABELS: Record<string, string> = {
  student: "Учень",
  teacher: "Вчитель",
  club: "Гурток",
  enrollment: "Запис на гурток",
  schedule_enrollment: "Запис на розклад",
  schedule: "Розклад",
  conducted_lesson: "Проведений урок",
  attendance: "Відвідуваність",
  payroll: "Зарплата",
  pay_rate: "Ставка зарплати",
  user: "Користувач",
  bot_schedule: "Бот: Розклад",
  automation: "Автоматизація",
  ai_settings: "Системні налаштування",
  calendar_event: "Календар: Урок",
  calendar_exception: "Календар: Канікули/Вихідні",
  mcp_token: "Доступ для AI",
  vulnerability_criterion: "Критерій вразливості",
};

export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;
export const entityLabel = (e: string) => ENTITY_LABELS[e] ?? e;

/** Опції фільтра дій — той самий набір, що в legacy. */
export const ACTION_FILTER_OPTIONS = ["CREATE", "UPDATE", "DELETE", "IMPORT", "EXPORT", "RESTORE"];
