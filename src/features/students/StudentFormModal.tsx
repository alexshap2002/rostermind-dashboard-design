import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { ageUk, formatDateUk, formatPhoneUk } from "../../lib/format";
import { IconClose } from "../../lib/icons";
import { useCanManage } from "../../components/admin/primitives";
import { WEEKDAY_SHORT, hhmm } from "../schedules/api";
import { criteriaQueries, invalidateCriteria, marksByStudent } from "../settings/api";
import type { CriteriaChanges } from "../settings/types";
import { studentsApi, studentsQueries } from "./api";
import { StudentScheduleModal } from "./StudentScheduleModal";
import type { Student, StudentInput } from "./types";

/** Відповідь 409 сервісу критеріїв: критерій видалили, поки картка була відкрита. */
const STALE_CRITERIA = "Список критеріїв змінився";

interface Props {
  student: Student | null; // null = створення нового
  onClose: () => void;
}

interface FormState {
  first_name: string;
  last_name: string;
  middle_name: string;
  birth_date: string;
  age: string;
  grade: string;
  phone_child: string;
  location: string;
  settlement_type: string;
  address: string;
  parent_name: string;
  father_name: string;
  mother_name: string;
  phone_mother: string;
  phone_father: string;
  benefit_other: string;
}

function initialForm(s: Student | null): FormState {
  return {
    first_name: s?.first_name ?? "",
    last_name: s?.last_name ?? "",
    middle_name: s?.middle_name ?? "",
    birth_date: s?.birth_date ?? "",
    age: s?.age != null ? String(s.age) : "",
    grade: s?.grade ?? "",
    phone_child: s?.phone_child ?? "",
    location: s?.location ?? "",
    settlement_type: s?.settlement_type ?? "",
    address: s?.address ?? "",
    parent_name: s?.parent_name ?? "",
    father_name: s?.father_name ?? "",
    mother_name: s?.mother_name ?? "",
    phone_mother: s?.phone_mother ?? "",
    phone_father: s?.phone_father ?? "",
    benefit_other: s?.benefit_other ?? "",
  };
}

function toPayload(f: FormState, criteria: CriteriaChanges | null): StudentInput {
  const opt = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    first_name: f.first_name.trim(),
    last_name: f.last_name.trim(),
    middle_name: opt(f.middle_name),
    birth_date: opt(f.birth_date),
    age: f.age.trim() === "" ? null : Number(f.age),
    grade: opt(f.grade),
    phone_child: opt(f.phone_child),
    location: opt(f.location),
    settlement_type: opt(f.settlement_type),
    address: opt(f.address),
    parent_name: opt(f.parent_name),
    father_name: opt(f.father_name),
    mother_name: opt(f.mother_name),
    phone_mother: opt(f.phone_mother),
    phone_father: opt(f.phone_father),
    benefit_other: opt(f.benefit_other),
    ...(criteria ? { vulnerability_criteria: criteria } : {}),
  };
}

function rateTone(rate: number): string {
  if (rate >= 80) return "good";
  if (rate >= 60) return "mid";
  return "low";
}

function requestedStatusLabel(status: string): string {
  switch (status) {
    case "requested": return "Очікує зарахування";
    case "enrolled": return "Зараховано";
    case "rejected": return "Відхилено";
    default: return status;
  }
}

/** Read-only секції картки: обрані при реєстрації, розклад, статистика. */
function StudentDetailSections({ studentId, onOpenSchedule }: { studentId: number; onOpenSchedule: () => void }) {
  const full = useQuery(studentsQueries.full(studentId));
  const data = full.data;

  return (
    <>
      <div className="fsection">Обрані при реєстрації</div>
      {full.isLoading ? (
        <div className="empty-inline">Завантаження…</div>
      ) : data && data.requested_clubs.length > 0 ? (
        <div className="sinfo-list">
          {data.requested_clubs.map((rc) => (
            <div className="sinfo-row" key={`${rc.club_id}-${rc.requested_at ?? ""}`}>
              <div className="sinfo-main">
                <div className="sinfo-name">{rc.club_name}</div>
                <div className="sinfo-meta">
                  {rc.campaign_title ?? "Анкета для батьків"}
                  {rc.requested_at ? ` · ${formatDateUk(rc.requested_at)}` : ""}
                </div>
              </div>
              <span className="tag enroll">{requestedStatusLabel(rc.status)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-inline">Учня не додавали через анкету для батьків</div>
      )}

      <div className="fsection between">
        <span>Розклад дитини</span>
        <button type="button" className="btn ghost" onClick={onOpenSchedule}>
          Змінити розклад
        </button>
      </div>
      {full.isLoading ? (
        <div className="empty-inline">Завантаження…</div>
      ) : data && data.enrolled_schedules.length > 0 ? (
        <div className="sinfo-list">
          {data.enrolled_schedules.map((sc) => (
            <div className="sinfo-row" key={sc.schedule_id}>
              <span className="day-badge"><b>{WEEKDAY_SHORT[sc.weekday]}</b><span>{hhmm(sc.start_time)}</span></span>
              <div className="sinfo-main">
                <div className="sinfo-name">{sc.club_name ?? "Без гуртка"}</div>
                <div className="sinfo-meta">
                  {sc.teacher_name ?? "Без викладача"}
                  {sc.group_name ? ` · ${sc.group_name}` : ""}
                </div>
              </div>
              {!sc.active && <span className="tag muted">Неактивний</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-inline">Не записаний на жодні розклади</div>
      )}

      <div className="fsection">Статистика відвідуваності</div>
      {full.isLoading ? (
        <div className="empty-inline">Завантаження…</div>
      ) : data && data.attendance.total_lessons > 0 ? (
        <div className="att-stats">
          <div className="att-top">
            <div className={`att-rate-big ${rateTone(data.attendance.rate)}`}>
              <b className="num">{data.attendance.rate}%</b>
              <span>відвідуваність</span>
            </div>
            <div className="att-split">
              <div className="att-chip present"><b className="num">{data.attendance.present}</b><span>Присутній</span></div>
              <div className="att-chip absent"><b className="num">{data.attendance.absent}</b><span>Відсутній</span></div>
              <div className="att-chip total"><b className="num">{data.attendance.total_lessons}</b><span>Усього</span></div>
            </div>
          </div>
          {data.attendance.by_club.length > 0 && (
            <div className="att-clubs">
              {data.attendance.by_club.map((c) => (
                <div className="att-club" key={c.club_name}>
                  <div className="att-club-top">
                    <span className="att-club-name">{c.club_name}</span>
                    <span className="att-club-num">{c.present}/{c.total} · <b>{c.rate}%</b></span>
                  </div>
                  <div className="att-cbar"><span style={{ width: `${c.rate}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="empty-inline">Немає записів про відвідуваність</div>
      )}
    </>
  );
}

export function StudentFormModal({ student, onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialForm(student));
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Критерії вразливості бачить і змінює лише адміністрація; вчителям — ні блоку, ні запитів.
  const canManage = useCanManage();
  const criteria = useQuery({ ...criteriaQueries.list(), enabled: canManage });
  const marks = useQuery({ ...criteriaQueries.marks(), enabled: canManage && student !== null });
  const initialIds = useMemo(
    () => new Set(student ? marksByStudent(marks.data).get(student.id) ?? [] : []),
    [marks.data, student],
  );
  // Лише те, що адміністратор змінив: на збереження йде різниця, а не весь набір.
  const [touched, setTouched] = useState<Record<number, boolean>>({});
  const isChecked = (id: number) => touched[id] ?? initialIds.has(id);
  const toggleCriterion = (id: number) => setTouched((t) => ({ ...t, [id]: !(t[id] ?? initialIds.has(id)) }));
  const criteriaChanges = useMemo<CriteriaChanges | null>(() => {
    const entries = Object.entries(touched).map(([id, on]) => [Number(id), on] as const);
    const add = entries.filter(([id, on]) => on && !initialIds.has(id)).map(([id]) => id);
    const remove = entries.filter(([id, on]) => !on && initialIds.has(id)).map(([id]) => id);
    return add.length || remove.length ? { add, remove } : null;
  }, [touched, initialIds]);
  const criteriaReady = !canManage || (!criteria.isLoading && !(student && marks.isLoading));

  const set = (key: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = toPayload(form, criteriaChanges);
      return student
        ? await studentsApi.update(student.id, payload)
        : await studentsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (criteriaChanges) invalidateCriteria(qc);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409 && err.message.includes(STALE_CRITERIA)) {
        // Критерій видалили, поки картка була відкрита: оновлюємо лише блок критеріїв,
        // решта введеного лишається.
        setTouched({});
        invalidateCriteria(qc);
        setError("Список критеріїв змінився, поки картка була відкрита. Позначки оновлено — перевірте їх і збережіть ще раз.");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Не вдалося зберегти. Спробуйте ще раз.");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("Ім'я та прізвище — обов'язкові поля");
      return;
    }
    save.mutate();
  }

  const text = (
    label: string,
    key: keyof FormState,
    span: string,
    props: { type?: string; placeholder?: string; required?: boolean } = {},
  ) => (
    <div className={`field ${span}`}>
      <label htmlFor={`f-${key}`}>{label}{props.required ? " *" : ""}</label>
      <input
        id={`f-${key}`}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        value={form[key]}
        onChange={(e) => set(key)(e.target.value)}
        required={props.required}
      />
    </div>
  );

  const studentName = `${form.last_name} ${form.first_name}`.trim();

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="modal-head">
          <h3>{student ? "Повна інформація про учня" : "Додати нового учня"}</h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          {student && (
            <div className="student-hero">
              <span className="sh-avatar">{(form.last_name || form.first_name || "?").charAt(0)}</span>
              <div className="sh-info">
                <div className="sh-name">{`${form.last_name} ${form.first_name}`.trim() || "Учень"}</div>
                <div className="sh-facts">
                  {form.age.trim() && <span className="sh-fact">{ageUk(Number(form.age))}</span>}
                  {form.grade.trim() && <span className="sh-fact">{form.grade} клас</span>}
                  {form.location.trim() && <span className="sh-fact">{form.location}</span>}
                  {form.phone_child.trim() && <span className="sh-fact">{formatPhoneUk(form.phone_child)}</span>}
                </div>
              </div>
            </div>
          )}

          <div className="fsection first">Особисті дані</div>
          <div className="fgrid">
            {text("Прізвище", "last_name", "span-4", { required: true })}
            {text("Ім'я", "first_name", "span-4", { required: true })}
            {text("По батькові", "middle_name", "span-4")}
            {text("День народження", "birth_date", "span-6", { type: "date" })}
            {text("Вік", "age", "span-3", { type: "number" })}
            {text("Клас", "grade", "span-3")}
            {text("Телефон дитини", "phone_child", "span-6", { type: "tel", placeholder: "+380 67 123 4567" })}
            {text("Місце проживання", "location", "span-6")}
            <div className="field span-6">
              <label htmlFor="f-settlement">Тип населеного пункту</label>
              <select
                id="f-settlement"
                value={form.settlement_type}
                onChange={(e) => set("settlement_type")(e.target.value)}
              >
                <option value="">Не вказано</option>
                <option value="Місто">Місто</option>
                <option value="СМТ">СМТ</option>
                <option value="Село">Село</option>
              </select>
            </div>
            {text("Адреса проживання", "address", "span-6")}
          </div>

          <div className="fsection">Батьки</div>
          <div className="fgrid">
            {text("ПІБ батьків (загальне)", "parent_name", "span-12")}
            {text("ПІБ матері", "mother_name", "span-6")}
            {text("Телефон матері", "phone_mother", "span-6", { type: "tel", placeholder: "+380 67 123 4567" })}
            {text("ПІБ батька", "father_name", "span-6")}
            {text("Телефон батька", "phone_father", "span-6", { type: "tel", placeholder: "+380 67 123 4567" })}
          </div>

          {canManage && (
            <>
              <div className="fsection between">
                <span>Критерії вразливості</span>
                <Link className="link" to="/settings">Налаштувати список</Link>
              </div>
              {!criteriaReady ? (
                <div className="empty-inline">Завантаження…</div>
              ) : (criteria.data?.items ?? []).length === 0 ? (
                <div className="empty-inline">У закладі немає критеріїв — додайте їх у «Налаштування → Інше».</div>
              ) : (
                <div className="check-grid">
                  {(criteria.data?.items ?? []).map((c) => (
                    <label className={`check${isChecked(c.id) ? " on" : ""}`} key={c.id}>
                      <input type="checkbox" checked={isChecked(c.id)} onChange={() => toggleCriterion(c.id)} />
                      <span style={{ flex: 1 }}>{c.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="fgrid" style={{ marginTop: 12 }}>
                <div className="field span-12">
                  <label htmlFor="f-benefit-other">Примітка</label>
                  <textarea
                    id="f-benefit-other"
                    rows={2}
                    placeholder="Алергії, обмеження, особливості — вільним текстом"
                    value={form.benefit_other}
                    onChange={(e) => set("benefit_other")(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {student && <StudentDetailSections studentId={student.id} onOpenSchedule={() => setScheduleOpen(true)} />}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="btn" disabled={save.isPending || !criteriaReady}>
            {save.isPending ? "Зберігаємо…" : student ? "Зберегти зміни" : "Додати учня"}
          </button>
        </div>
      </form>
    </div>
    {student && scheduleOpen && (
      <StudentScheduleModal
        studentId={student.id}
        studentName={studentName}
        onClose={() => setScheduleOpen(false)}
      />
    )}
    </>
  );
}
