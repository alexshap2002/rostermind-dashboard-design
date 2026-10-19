/** Форми відповідей /api/vulnerability-criteria (app/api/vulnerability_criteria.py). */

export interface Criterion {
  id: number;
  /** Ключ стандартного критерію (лишається після перейменування); null — власний. */
  key: string | null;
  name: string;
  sort_order: number;
  students_count: number;
}

export interface MissingStandard {
  key: string;
  name: string;
}

export interface CriteriaList {
  items: Criterion[];
  missing_standard: MissingStandard[];
  limit: number;
}

/** Позначки дітей: { "<student_id>": [criterion_id, …] } (ключі JSON — рядки). */
export interface CriteriaMarks {
  marks: Record<string, number[]>;
}

/** Зміни критеріїв дитини — лише різниця (контракт CriteriaChanges у students.py). */
export interface CriteriaChanges {
  add: number[];
  remove: number[];
}
