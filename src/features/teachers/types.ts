/** Форми відповідей бекенду для сторінки «Вчителі» (app/api/teachers.py, app/api/schedules.py). */

export interface Teacher {
  id: number;
  full_name: string;
  tg_chat_id: number | null;
  birth_date: string | null;
  active: boolean;
  created_at: string;
  accrued_salary: number;
  conducted_lessons_count: number;
  missed_lessons_count: number;
  unmarked_lessons_count: number;
}

export interface TeacherInput {
  full_name: string;
  tg_chat_id?: number | null;
  birth_date?: string | null;
  active?: boolean;
  /** Лише при створенні: одразу завести тариф (як у legacy-формі). */
  create_pay_rate?: boolean;
  pay_rate_amount?: number | null;
}

export interface ScheduleTeacherInfo {
  teacher_id: number;
  teacher_name?: string | null;
  is_primary?: boolean;
}

export interface Schedule {
  id: number;
  club_id: number;
  weekday: number;
  start_time: string;
  teacher_id: number;
  active: boolean;
  created_at: string;
  club_name?: string | null;
  teacher_name?: string | null;
  teachers?: ScheduleTeacherInfo[] | null;
}

export interface TeacherImportResult {
  success: boolean;
  message: string;
  created_count: number;
  skipped_count: number;
  errors: string[];
}
