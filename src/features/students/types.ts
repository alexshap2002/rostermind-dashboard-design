/** Форми відповідей бекенду для сторінки «Учні» (app/api/students.py, app/api/public.py, app/api/clubs.py). */

import { WEEKDAY_SHORT } from "../schedules/api";
import type { CriteriaChanges } from "../settings/types";

/** Один урок дитини в тижневому розкладі (поле `schedule` у списку учнів). */
export interface StudentLessonSlot {
  schedule_id: number;
  weekday: number; // 1 = Пн … 7 = Нд
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  club_name: string | null;
  group_name: string | null;
}

/** «Чт 16:00–16:50»; без кінця — «Чт 16:00». */
export function slotTime(slot: StudentLessonSlot, withEnd = true): string {
  const day = WEEKDAY_SHORT[slot.weekday] ?? "";
  return `${day} ${slot.start_time}${withEnd ? `–${slot.end_time}` : ""}`.trim();
}

export interface Student {
  id: number;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  birth_date: string | null;
  age: number | null;
  grade: string | null;
  phone_child: string | null;
  location: string | null;
  address: string | null;
  parent_name: string | null;
  father_name: string | null;
  mother_name: string | null;
  phone_mother: string | null;
  phone_father: string | null;
  settlement_type: string | null;
  /** «Примітка» (вільний текст, не критерій). Вчителям приходить порожньою. */
  benefit_other: string | null;
  raw_row_id: string | null;
  created_at: string;
  /** Тижневий розклад, Пн→Нд; лише у списку учнів (старіший бекенд поля не віддає). */
  schedule?: StudentLessonSlot[];
}

/** Поля анкети для створення/редагування (контракт StudentCreate/StudentUpdate). */
export interface StudentInput {
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  birth_date?: string | null;
  age?: number | null;
  grade?: string | null;
  phone_child?: string | null;
  location?: string | null;
  address?: string | null;
  parent_name?: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  phone_mother?: string | null;
  phone_father?: string | null;
  settlement_type?: string | null;
  benefit_other?: string | null;
  /** Критерії вразливості — лише різниця; позначки читаються з criteriaQueries.marks(). */
  vulnerability_criteria?: CriteriaChanges;
}

export interface Club {
  id: number;
  name: string;
  duration_min: number;
  location: string;
  created_at: string;
}

export interface Enrollment {
  id: number;
  student_id: number;
  club_id: number;
  is_primary: boolean;
  created_at: string;
}

export interface ImportResult {
  success: boolean;
  message: string;
  created_count: number;
  skipped_count: number;
  errors: string[];
  /** Нерозпізнані колонки «… (так/ні)». */
  warnings?: string[];
}

/** Повна інформація про учня (GET /api/students/{id}/full). */
export interface RequestedClub {
  club_id: number;
  club_name: string;
  campaign_title: string | null;
  status: string;
  requested_at: string | null;
}

export interface EnrolledSchedule {
  schedule_id: number;
  club_id: number | null;
  club_name: string | null;
  weekday: number; // 1 = Понеділок … 7 = Неділя
  start_time: string; // "HH:MM"
  group_name: string | null;
  teacher_name: string | null;
  active: boolean;
  enrolled_at: string | null;
}

export interface AttendanceByClub {
  club_name: string;
  present: number;
  total: number;
  rate: number;
}

export interface StudentAttendanceStats {
  total_lessons: number;
  present: number;
  absent: number;
  rate: number;
  by_club: AttendanceByClub[];
}

export interface StudentFull {
  id: number;
  requested_clubs: RequestedClub[];
  enrolled_schedules: EnrolledSchedule[];
  attendance: StudentAttendanceStats;
}

export function studentFullName(s: Pick<Student, "first_name" | "middle_name" | "last_name">): string {
  return [s.last_name, s.first_name, s.middle_name].filter(Boolean).join(" ");
}

