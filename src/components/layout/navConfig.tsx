import type { ReactNode } from "react";
import {
  IconActivity, IconArchive, IconBars, IconBell, IconBranches, IconBuilding,
  IconCalendar, IconCalendarDetail, IconCard, IconCheckSquare, IconClock,
  IconClubs, IconMoney, IconRobot, IconSend, IconSettings, IconStudents,
  IconTeacher, IconUsersCog,
} from "../../lib/icons";

export interface NavLeaf {
  title: string;
  /** Підпис під назвою; може залежати від summary-даних. */
  sub?: string;
  href: string;
  icon: ReactNode;
  /** Колір токена для плашки іконки. */
  tone: "terra" | "olive" | "gold" | "navy" | "neutral";
  /** Видимість лише для власника (як у legacy-сайдбарі). */
  ownerOnly?: boolean;
  /** Видимість для owner або призначеного network member. */
  networkOnly?: boolean;
}

export interface NavGroup {
  label: string;
  badge?: string;
  items: NavLeaf[];
  /** Пункти мережі філій — у власника їх замінює перемикач у шапці. */
  network?: boolean;
}

const toneStyle: Record<NavLeaf["tone"], { background: string; color: string }> = {
  terra: { background: "var(--terra-soft)", color: "var(--terra)" },
  olive: { background: "var(--olive-soft)", color: "var(--olive)" },
  gold: { background: "var(--gold-soft)", color: "var(--gold)" },
  navy: { background: "var(--navy-soft)", color: "var(--navy)" },
  neutral: { background: "#f5efe4", color: "var(--text-2)" },
};

export function toneToStyle(tone: NavLeaf["tone"]) {
  return toneStyle[tone];
}

export interface NavCounts {
  students?: number;
  teachers?: number;
  clubs?: number;
  active_schedules?: number;
}

/** Меню вчителя: лише його власні розділи, без керування закладом. */
function buildTeacherNavGroups(c: NavCounts = {}): NavGroup[] {
  const num = (n?: number) => (n === undefined ? "" : String(n));
  return [
    {
      label: "Мої заняття",
      items: [
        { title: "Уроки", sub: "Відмітка присутності", href: "/conducted-lessons", icon: <IconCheckSquare />, tone: "terra" },
        { title: "Розклад", sub: c.active_schedules !== undefined ? `${num(c.active_schedules)} моїх занять` : "Мій розклад", href: "/schedules", icon: <IconCalendar />, tone: "olive" },
        { title: "Календар", sub: "Мої уроки по днях", href: "/calendar", icon: <IconCalendarDetail />, tone: "gold" },
      ],
    },
    {
      label: "Мої дані",
      items: [
        { title: "Учні", sub: c.students !== undefined ? `${num(c.students)} у моїх гуртках` : "Мої учні", href: "/students", icon: <IconStudents />, tone: "terra" },
        { title: "Гуртки", sub: c.clubs !== undefined ? `${num(c.clubs)} моїх` : "Мої гуртки", href: "/clubs", icon: <IconClubs />, tone: "navy" },
        { title: "Зарплата", sub: "Мої нарахування", href: "/payroll", icon: <IconMoney />, tone: "gold" },
        { title: "Сповіщення", sub: "Коли писати мені в Telegram", href: "/my-notifications", icon: <IconBell />, tone: "neutral" },
      ],
    },
  ];
}

/** Повна структура legacy-сайдбара, перегрупована у випадайки.
    isOwner ховає owner-only пункти (Користувачі, Архів, філії) — як у старій адмінці.
    role === "teacher" повертає окреме меню вчителя. */
export function buildNavGroups(
  c: NavCounts = {},
  isOwner = true,
  hasNetworkAccess = isOwner,
  role?: "owner" | "admin" | "teacher",
): NavGroup[] {
  if (role === "teacher") return buildTeacherNavGroups(c);
  const num = (n?: number) => (n === undefined ? "" : String(n));
  const groups: NavGroup[] = [
    {
      label: "Дані",
      items: [
        { title: "Учні", sub: c.students !== undefined ? `${num(c.students)} активних учнів` : "Список учнів", href: "/students", icon: <IconStudents />, tone: "terra" },
        { title: "Вчителі", sub: c.teachers !== undefined ? `${num(c.teachers)} у штаті` : "Список вчителів", href: "/teachers", icon: <IconTeacher />, tone: "olive" },
        { title: "Уроки", sub: c.clubs !== undefined ? `${num(c.clubs)} гуртків` : "Гуртки", href: "/clubs", icon: <IconClubs />, tone: "gold" },
        { title: "Запрошення вчителів", sub: "Посилання для реєстрації в Telegram", href: "/registration", icon: <IconSend />, tone: "navy" },
        { title: "Користувачі", sub: "Доступи та ролі", href: "/users", icon: <IconUsersCog />, tone: "neutral", ownerOnly: true },
      ],
    },
    {
      label: "Навчання",
      items: [
        { title: "Розклад", sub: c.active_schedules !== undefined ? `${num(c.active_schedules)} активних занять` : "Розклад", href: "/schedules", icon: <IconCalendar />, tone: "terra" },
        { title: "Проведені уроки", sub: "Журнал занять", href: "/conducted-lessons", icon: <IconCheckSquare />, tone: "navy" },
        { title: "Календар", sub: "Огляд по тижнях", href: "/calendar", icon: <IconCalendarDetail />, tone: "olive" },
      ],
    },
    {
      label: "Фінанси",
      items: [
        { title: "Тарифи", sub: "Ставки вчителів", href: "/pay-rates", icon: <IconCard />, tone: "gold" },
        { title: "Зарплати", sub: "Нарахування вчителям", href: "/payroll", icon: <IconMoney />, tone: "olive" },
      ],
    },
    {
      label: "Аналітика",
      items: [
        { title: "Звіт", sub: "Зведення за період", href: "/statistics", icon: <IconActivity />, tone: "navy" },
        { title: "Статистика", sub: "По уроках і групах", href: "/lesson-statistics", icon: <IconBars />, tone: "terra" },
        { title: "Історія змін", sub: "Аудит дій", href: "/audit", icon: <IconClock />, tone: "neutral" },
        { title: "Архів", sub: "Минулі навчальні роки", href: "/archive", icon: <IconArchive />, tone: "neutral", ownerOnly: true },
      ],
    },
    {
      // Усі налаштування закладу — тут, а не по різних розділах. Нове — у «Інше».
      label: "Налаштування",
      items: [
        { title: "Telegram відмітка", sub: "Бот для вчителів", href: "/bot", icon: <IconSend />, tone: "navy" },
        { title: "Сповіщення адміністратору", sub: "Налаштування алертів", href: "/telegram-notifications", icon: <IconBell />, tone: "gold" },
        { title: "Сповіщення вчителям", sub: "Нагадування про відмітки", href: "/teacher-notifications", icon: <IconBell />, tone: "terra" },
        { title: "Доступ для AI", sub: "OpenClaw, Claude, ChatGPT", href: "/ai-access", icon: <IconRobot />, tone: "olive" },
        { title: "Інше", sub: "Критерії вразливості та інше", href: "/settings", icon: <IconSettings />, tone: "neutral" },
      ],
    },
    {
      label: "Філії",
      network: true,
      items: [
        { title: "Уся мережа", sub: "Зведення по всіх філіях", href: "/main-branch", icon: <IconBuilding />, tone: "navy", networkOnly: true },
        { title: "Філії й оплата", sub: "Додати філію, оплата, адміністратори", href: "/branches", icon: <IconBranches />, tone: "terra", ownerOnly: true },
      ],
    },
  ];

  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => (isOwner || !it.ownerOnly) && (hasNetworkAccess || !it.networkOnly)),
    }))
    .filter((g) => g.items.length > 0);
}
