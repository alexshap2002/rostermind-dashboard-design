import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { formatNumber } from "../../lib/format";
import { IconClose, IconPencil, IconPlus, IconSearch, IconTrash } from "../../lib/icons";
import { TopNav } from "../../components/layout/TopNav";
import { ExportLink, useCanManage } from "../../components/admin/primitives";
import { useScrollShades } from "../../components/admin/useScrollShades";
import { dashboardQueries } from "../dashboard/api";
import { clubsQueries } from "../clubs/api";
import { teachersQueries } from "../teachers/api";
import {
  conductedLessonsApi, conductedLessonsLinks, conductedLessonsQueries,
  type AvailableLessonSchedule,
  type ConductedLesson,
  type LessonMetaUpdate,
  type LessonStudent,
  type ManualLessonCreateInput,
  type ScheduleStudent,
  type TeacherPresenceUpdate,
} from "./api";

function todayMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** ISO datetime → "DD.MM.YYYY" + окремо "HH:MM". */
function splitDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
/** ISO datetime → значення для <input type="datetime-local">. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusLabel(status: string) {
  if (status === "PRESENT") return "Присутній";
  if (status === "ABSENT") return "Відсутній";
  return "Не відмічено";
}

/* ═══════════ Створення проведеного уроку ═══════════ */

interface CreateDraft {
  scheduleId: number | "";
  lessonDate: string;
  lessonTime: string;
  duration: string;
  notes: string;
  autoPayroll: boolean;
  students: Record<number, "PRESENT" | "ABSENT">;
  teachers: Record<number, "PRESENT" | "ABSENT">;
}

const emptyDraft = (): CreateDraft => ({
  scheduleId: "",
  lessonDate: todayIsoDate(),
  lessonTime: "10:00",
  duration: "",
  notes: "",
  autoPayroll: true,
  students: {},
  teachers: {},
});

function CreateLessonModal({
  schedules,
  initial,
  onClose,
}: {
  schedules: AvailableLessonSchedule[];
  /** Невідмічений урок з «Усієї мережі»: гурток і дата вже відомі. */
  initial?: { scheduleId: number; lessonDate: string; lessonTime: string } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CreateDraft>(() => (initial ? { ...emptyDraft(), ...initial } : emptyDraft()));
  const [error, setError] = useState<string | null>(null);
  const selectedSchedule = schedules.find((s) => s.id === draft.scheduleId) ?? null;
  const students = useQuery(conductedLessonsQueries.scheduleStudents(selectedSchedule?.id ?? null));

  useEffect(() => {
    if (!selectedSchedule) return;
    setDraft((prev) => {
      const teacherStatuses: CreateDraft["teachers"] = {};
      for (const teacher of selectedSchedule.teachers ?? []) teacherStatuses[teacher.teacher_id] = "PRESENT";
      return { ...prev, teachers: teacherStatuses };
    });
  }, [selectedSchedule]);

  useEffect(() => {
    if (!students.data) return;
    setDraft((prev) => {
      const next = { ...prev.students };
      for (const student of students.data) {
        if (!next[student.student_id]) next[student.student_id] = "PRESENT";
      }
      return { ...prev, students: next };
    });
  }, [students.data]);

  const presentStudents = Object.values(draft.students).filter((s) => s === "PRESENT").length;
  const absentStudents = Object.values(draft.students).filter((s) => s === "ABSENT").length;
  const presentTeachers = Object.values(draft.teachers).filter((s) => s === "PRESENT").length;

  const create = useMutation({
    mutationFn: (payload: ManualLessonCreateInput) => conductedLessonsApi.createManual(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conducted-lessons"] });
      qc.invalidateQueries({ queryKey: ["lesson-statistics"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Не вдалося створити проведений урок"),
  });

  function setAllStudents(status: "PRESENT" | "ABSENT") {
    setDraft((p) => {
      const next: CreateDraft["students"] = {};
      for (const s of students.data ?? []) next[s.student_id] = status;
      return { ...p, students: next };
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!draft.scheduleId) return setError("Оберіть заняття з розкладу");
    if (presentTeachers === 0) return setError("Не може бути урок без жодного присутнього вчителя");
    const lessonDate = `${draft.lessonDate}T${draft.lessonTime || "10:00"}:00`;
    create.mutate({
      schedule_id: draft.scheduleId,
      lesson_date: lessonDate,
      student_attendance: Object.entries(draft.students).map(([studentId, status]) => ({
        student_id: Number(studentId),
        status,
      })),
      teacher_attendance: Object.entries(draft.teachers).map(([teacherId, status]) => ({
        teacher_id: Number(teacherId),
        status,
      })),
      notes: draft.notes || null,
      lesson_duration_minutes: draft.duration ? Number(draft.duration) : null,
      auto_calculate_payroll: draft.autoPayroll,
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3>Додати проведений урок</h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}
          <div className="fgrid">
            <div className="field span-12">
              <label htmlFor="cl-schedule">Заняття з розкладу *</label>
              <select
                id="cl-schedule"
                value={draft.scheduleId}
                onChange={(e) => setDraft((prev) => ({ ...prev, scheduleId: e.target.value ? Number(e.target.value) : "", students: {}, teachers: {} }))}
                required
              >
                <option value="">Оберіть заняття…</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>{s.display_name}</option>
                ))}
              </select>
            </div>
            <div className="field span-4">
              <label htmlFor="cl-date">Дата *</label>
              <input id="cl-date" type="date" value={draft.lessonDate} onChange={(e) => setDraft((p) => ({ ...p, lessonDate: e.target.value }))} required />
            </div>
            <div className="field span-4">
              <label htmlFor="cl-time">Час *</label>
              <input id="cl-time" type="time" value={draft.lessonTime} onChange={(e) => setDraft((p) => ({ ...p, lessonTime: e.target.value }))} required />
            </div>
            <div className="field span-4">
              <label htmlFor="cl-dur">Тривалість, хв</label>
              <input id="cl-dur" type="number" min="1" placeholder="з гуртка" value={draft.duration} onChange={(e) => setDraft((p) => ({ ...p, duration: e.target.value }))} />
            </div>
            <div className="field span-12">
              <label htmlFor="cl-notes">Нотатки</label>
              <textarea id="cl-notes" rows={2} value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <label className={`check span-12${draft.autoPayroll ? " on" : ""}`}>
              <input type="checkbox" checked={draft.autoPayroll} onChange={() => setDraft((p) => ({ ...p, autoPayroll: !p.autoPayroll }))} />
              Автоматично нарахувати зарплату, якщо є активний тариф
            </label>
          </div>

          {selectedSchedule && (
            <>
              <div className="fsection">Присутність вчителів</div>
              <div className="attendance-grid">
                {(selectedSchedule.teachers ?? []).map((teacher) => (
                  <button
                    type="button"
                    key={teacher.teacher_id}
                    className={`attendance-pill ${draft.teachers[teacher.teacher_id] === "ABSENT" ? "absent" : "present"}`}
                    onClick={() => setDraft((p) => ({
                      ...p,
                      teachers: { ...p.teachers, [teacher.teacher_id]: p.teachers[teacher.teacher_id] === "ABSENT" ? "PRESENT" : "ABSENT" },
                    }))}
                  >
                    <span>{teacher.full_name}</span>
                    <b>{draft.teachers[teacher.teacher_id] === "ABSENT" ? "відсутній" : "присутній"}</b>
                  </button>
                ))}
              </div>

              <div className="fsection" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Відвідуваність · {formatNumber(presentStudents)} присутні · {formatNumber(absentStudents)} відсутні</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="btn ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setAllStudents("PRESENT")}>Всі присутні</button>
                  <button type="button" className="btn ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setAllStudents("ABSENT")}>Всі відсутні</button>
                </span>
              </div>
              {students.isLoading && <div className="empty-inline">Завантажуємо учнів…</div>}
              {!students.isLoading && (students.data ?? []).length === 0 && (
                <div className="empty-inline">У групі немає записаних учнів</div>
              )}
              <div className="attendance-grid">
                {(students.data ?? []).map((student: ScheduleStudent) => (
                  <button
                    type="button"
                    key={student.student_id}
                    className={`attendance-pill ${draft.students[student.student_id] === "ABSENT" ? "absent" : "present"}`}
                    onClick={() => setDraft((p) => ({
                      ...p,
                      students: { ...p.students, [student.student_id]: p.students[student.student_id] === "ABSENT" ? "PRESENT" : "ABSENT" },
                    }))}
                  >
                    <span>{student.full_name}</span>
                    <b>{draft.students[student.student_id] === "ABSENT" ? "відсутній" : "присутній"}</b>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="btn" disabled={create.isPending}>
            {create.isPending ? "Створюємо…" : "Створити урок"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ═══════════ Редагування проведеного уроку ═══════════ */

interface TeacherDraft {
  status: "PRESENT" | "ABSENT";
  payrollEnabled: boolean;
}

function EditLessonModal({ lesson, onClose }: { lesson: ConductedLesson; onClose: () => void }) {
  const qc = useQueryClient();
  // Зарплату за урок вмикає й вимикає лише адміністрація; вчитель відмічає присутність.
  const canManage = useCanManage();
  const students = useQuery(conductedLessonsQueries.lessonStudents(lesson.id));

  // Присутність/зарплата вчителів — стартовий стан із даних уроку
  const [teacherDraft, setTeacherDraft] = useState<Record<number, TeacherDraft>>(() => {
    const map: Record<number, TeacherDraft> = {};
    for (const t of lesson.teachers) {
      map[t.teacher_id] = {
        status: t.status === "ABSENT" ? "ABSENT" : "PRESENT",
        payrollEnabled: t.has_payroll,
      };
    }
    return map;
  });

  // Мета-поля
  const [lessonDate, setLessonDate] = useState(isoToLocalInput(lesson.lesson_date));
  const [duration, setDuration] = useState(lesson.lesson_duration_minutes ? String(lesson.lesson_duration_minutes) : "");
  const [topic, setTopic] = useState(lesson.lesson_topic ?? "");
  const [notes, setNotes] = useState(lesson.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["conducted-lessons"] });
    qc.invalidateQueries({ queryKey: ["conducted-lessons", "lesson-students", lesson.id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  // Учнів перемикаємо одразу (як у legacy — миттєвий PUT)
  const studentToggle = useMutation({
    mutationFn: ({ studentId, status }: { studentId: number; status: "PRESENT" | "ABSENT" }) =>
      conductedLessonsApi.updateStudentStatus(lesson.id, studentId, status),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Не вдалося змінити відмітку учня"),
  });

  const presentTeachers = Object.values(teacherDraft).filter((t) => t.status === "PRESENT").length;

  const save = useMutation({
    mutationFn: async () => {
      // 1) Присутність + нарахування вчителів
      const teacherPayload: TeacherPresenceUpdate[] = lesson.teachers.map((t) => {
        const d = teacherDraft[t.teacher_id];
        const present = d.status === "PRESENT";
        return {
          teacher_id: t.teacher_id,
          status: d.status,
          payroll_enabled: present && d.payrollEnabled,
          payroll_amount: null, // null → бекенд візьме активний тариф на дату уроку
        };
      });
      await conductedLessonsApi.updateTeachers(lesson.id, teacherPayload);

      // 2) Мета-поля уроку
      const meta: LessonMetaUpdate = {
        lesson_date: `${lessonDate}:00`,
        lesson_duration_minutes: duration ? Number(duration) : null,
        lesson_topic: topic.trim() || null,
        notes: notes.trim() || null,
      };
      await conductedLessonsApi.updateMeta(lesson.id, meta);
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Не вдалося зберегти зміни"),
  });

  function toggleTeacherPresence(id: number) {
    setError(null);
    setTeacherDraft((prev) => {
      const cur = prev[id];
      const goingAbsent = cur.status === "PRESENT";
      if (goingAbsent && presentTeachers <= 1) {
        setNotice("Потрібен хоча б один присутній вчитель");
        setTimeout(() => setNotice(null), 2200);
        return prev;
      }
      return {
        ...prev,
        [id]: goingAbsent
          ? { status: "ABSENT", payrollEnabled: false } // відсутній не отримує зарплату
          : { status: "PRESENT", payrollEnabled: true },
      };
    });
  }
  function togglePayroll(id: number) {
    setTeacherDraft((prev) => {
      if (prev[id].status !== "PRESENT") return prev;
      return { ...prev, [id]: { ...prev[id], payrollEnabled: !prev[id].payrollEnabled } };
    });
  }

  const { date, time } = splitDateTime(lesson.lesson_date);
  const presentStudents = (students.data ?? []).filter((s) => s.status === "PRESENT").length;
  const totalStudents = (students.data ?? []).length;

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (presentTeachers === 0) return setError("Не може бути урок без жодного присутнього вчителя");
    save.mutate();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3>
            {lesson.club_name ?? "Урок"}
            <span className="chip" style={{ marginLeft: 10 }}>{date} {time}</span>
          </h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}
          {notice && <div className="form-ok">{notice}</div>}

          <div className="fsection">Присутність вчителів та зарплата</div>
          <div className="att-teachers">
            {lesson.teachers.map((t) => {
              const d = teacherDraft[t.teacher_id];
              const present = d.status === "PRESENT";
              return (
                <div key={t.teacher_id} className={`att-teacher${present ? "" : " off"}`}>
                  <div className="att-teacher-name">{t.full_name}</div>
                  <div className="att-toggles">
                    <button
                      type="button"
                      className="att-switch"
                      onClick={() => toggleTeacherPresence(t.teacher_id)}
                      aria-pressed={present}
                    >
                      <span className={`switch${present ? " on" : ""}`} />
                      <span className={present ? "att-on" : "att-off"}>{present ? "Присутній" : "Відсутній"}</span>
                    </button>
                    <button
                      type="button"
                      className={`att-switch${present && canManage ? "" : " is-disabled"}`}
                      disabled={!present || !canManage}
                      onClick={() => togglePayroll(t.teacher_id)}
                      aria-pressed={present && d.payrollEnabled}
                      title={
                        !canManage ? "Зарплату вмикає адміністратор"
                          : present ? "Нараховувати зарплату за цей урок" : "Відсутній вчитель не отримує зарплату"
                      }
                    >
                      <span className={`switch${present && d.payrollEnabled ? " on gold" : ""}`} />
                      <span>Нараховувати зарплату</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="cell-sub" style={{ marginTop: 8 }}>
            Зарплата рахується за активним тарифом вчителя на дату уроку. Якщо тарифу немає — збереження попередить.
          </div>

          <div className="fsection">Відвідуваність учнів · {formatNumber(presentStudents)}/{formatNumber(totalStudents)}</div>
          {students.isLoading && <div className="empty-inline">Завантажуємо учнів…</div>}
          <div className="attendance-grid">
            {(students.data ?? []).map((student: LessonStudent) => {
              const next = student.status === "PRESENT" ? "ABSENT" : "PRESENT";
              return (
                <button
                  type="button"
                  key={student.student_id}
                  className={`attendance-pill ${student.status === "ABSENT" ? "absent" : "present"}`}
                  disabled={studentToggle.isPending}
                  onClick={() => studentToggle.mutate({ studentId: student.student_id, status: next })}
                >
                  <span>{student.full_name}</span>
                  <b>{statusLabel(student.status)}</b>
                </button>
              );
            })}
          </div>

          <div className="fsection">Деталі уроку</div>
          <div className="fgrid">
            <div className="field span-6">
              <label htmlFor="el-date">Дата та час</label>
              <input id="el-date" type="datetime-local" value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} />
            </div>
            <div className="field span-6">
              <label htmlFor="el-dur">Тривалість, хв</label>
              <input id="el-dur" type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="з гуртка" />
            </div>
            <div className="field span-12">
              <label htmlFor="el-topic">Тема уроку</label>
              <input id="el-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Необов'язково" />
            </div>
            <div className="field span-12">
              <label htmlFor="el-notes">Нотатки</label>
              <textarea id="el-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>Закрити</button>
          <button type="submit" className="btn" disabled={save.isPending}>
            {save.isPending ? "Зберігаємо…" : "Зберегти зміни"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ═══════════ Сторінка ═══════════ */

function attendanceTagClass(rate: number) {
  if (rate >= 80) return "create";
  if (rate >= 60) return "enroll";
  return "delete";
}

export function ConductedLessonsPage() {
  const qc = useQueryClient();
  const canManage = useCanManage();
  const summary = useQuery(dashboardQueries.summary());
  const [search, setSearch] = useState("");
  const [teacherId, setTeacherId] = useState<number | "">("");
  const [clubId, setClubId] = useState<number | "">("");
  const [startDate, setStartDate] = useState(todayMonthStart());
  const [endDate, setEndDate] = useState(todayIsoDate());
  const [onlyUncalculated, setOnlyUncalculated] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<{ scheduleId: number; lessonDate: string; lessonTime: string } | null>(null);
  const [editLesson, setEditLesson] = useState<ConductedLesson | null>(null);
  const [deleteLesson, setDeleteLesson] = useState<ConductedLesson | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);
  const scrollRef = useScrollShades<HTMLDivElement>();

  const filters = useMemo(() => ({
    teacher_id: teacherId,
    club_id: clubId,
    start_date: startDate,
    end_date: endDate,
    only_uncalculated: onlyUncalculated,
    limit: 1000,
  }), [teacherId, clubId, startDate, endDate, onlyUncalculated]);

  const lessons = useQuery(conductedLessonsQueries.list(filters));
  const teachers = useQuery({ ...teachersQueries.list(), enabled: canManage });
  const clubs = useQuery(clubsQueries.list());
  const schedules = useQuery(conductedLessonsQueries.availableSchedules());

  // Deep-link зі «Статистики уроків»: /conducted-lessons?edit=<id> → відкрити редагування уроку.
  const [urlParams, setUrlParams] = useSearchParams();
  const editParamId = urlParams.get("edit") ? Number(urlParams.get("edit")) : null;
  const deepLesson = useQuery(conductedLessonsQueries.byId(editParamId));
  const deepHandledRef = useRef<number | null>(null);
  const [deepError, setDeepError] = useState<string | null>(null);
  useEffect(() => {
    if (deepLesson.data && deepHandledRef.current !== deepLesson.data.id) {
      deepHandledRef.current = deepLesson.data.id;
      setDeepError(null);
      setEditLesson(deepLesson.data);
      const next = new URLSearchParams(urlParams);
      next.delete("edit");
      setUrlParams(next, { replace: true });
    } else if (deepLesson.error && editParamId != null) {
      // Урок за посиланням не знайдено/немає доступу — не лишаємо порожню модалку.
      setDeepError(
        deepLesson.error instanceof ApiError && deepLesson.error.status === 404
          ? `Урок #${editParamId} не знайдено (можливо, видалений).`
          : "Не вдалося відкрити урок за посиланням.",
      );
      const next = new URLSearchParams(urlParams);
      next.delete("edit");
      setUrlParams(next, { replace: true });
    }
  }, [deepLesson.data, deepLesson.error, editParamId, urlParams, setUrlParams]);

  // «Відмітити →» з «Усієї мережі»: /conducted-lessons?new=1&schedule=<id>&date=<YYYY-MM-DD>
  useEffect(() => {
    if (urlParams.get("new") !== "1" || !schedules.data) return;
    const scheduleId = Number(urlParams.get("schedule"));
    const date = urlParams.get("date") ?? "";
    const schedule = schedules.data.find((s) => s.id === scheduleId);
    if (schedule && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setCreatePrefill({ scheduleId, lessonDate: date, lessonTime: (schedule.time || "10:00").slice(0, 5) });
    } else {
      setCreatePrefill(null);
    }
    setCreateOpen(true);
    const next = new URLSearchParams(urlParams);
    for (const key of ["new", "schedule", "date"]) next.delete(key);
    setUrlParams(next, { replace: true });
  }, [urlParams, schedules.data, setUrlParams]);

  // Пошук — по гуртку, вчителях, темі, нотатках (клієнтський, як legacy)
  const rows = useMemo(() => {
    const list = lessons.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((l) =>
      [l.club_name, l.lesson_topic, l.notes, l.teacher_name, ...l.teachers.map((t) => t.full_name)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [lessons.data, search]);

  const totals = useMemo(() => ({
    count: rows.length,
    present: rows.reduce((sum, row) => sum + row.present_students, 0),
    absent: rows.reduce((sum, row) => sum + row.absent_students, 0),
  }), [rows]);

  const remove = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) => conductedLessonsApi.remove(id, force),
    onSuccess: (res, vars) => {
      if (res.error && !vars.force) {
        const deps = res.dependencies;
        const extra = deps
          ? ` Пов'язані записи: відвідуваність — ${deps.attendance_records}, нарахування — ${deps.payroll_records}.`
          : "";
        setDeleteWarning((res.message || "Урок має пов'язані дані.") + extra);
        return;
      }
      setDeleteLesson(null);
      setDeleteWarning(null);
      qc.invalidateQueries({ queryKey: ["conducted-lessons"] });
      qc.invalidateQueries({ queryKey: ["lesson-statistics"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const s = summary.data;
  const counts = s
    ? { students: s.stats.students, teachers: s.stats.teachers, clubs: s.stats.clubs, active_schedules: s.stats.active_schedules }
    : {};

  const hasFilters = search || teacherId !== "" || clubId !== "" || onlyUncalculated
    || startDate !== todayMonthStart() || endDate !== todayIsoDate();

  if (summary.error instanceof ApiError && summary.error.status === 401) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <TopNav counts={counts} user={s?.user} tenantName={s?.tenant.name} />

      <div className="content wide">
        <div className="page-head">
          <div>
            <h2>Проведені уроки</h2>
            <p>
              {lessons.data
                ? `${formatNumber(totals.count)} уроків · ${formatNumber(totals.present)} присутніх`
                : "Завантаження…"}
            </p>
          </div>
        </div>

        {lessons.error instanceof ApiError && <div className="form-error">{lessons.error.message}</div>}
        {deepError && (
          <div className="form-error" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>{deepError}</span>
            <button className="link" onClick={() => setDeepError(null)}>Закрити</button>
          </div>
        )}

        <div className="toolbar">
          <div className="tsearch">
            <IconSearch />
            <input
              placeholder="Пошук: гурток, вчитель, тема, нотатки…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canManage && (
            <select className="tselect" value={teacherId} onChange={(e) => setTeacherId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Вчитель: всі</option>
              {(teachers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          )}
          <select className="tselect" value={clubId} onChange={(e) => setClubId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Гурток: всі</option>
            {(clubs.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="tsel-date">
            <span>з</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="tsel-date">
            <span>по</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label className={`check${onlyUncalculated ? " on" : ""}`} style={{ marginBottom: 0 }}>
            <input type="checkbox" checked={onlyUncalculated} onChange={() => setOnlyUncalculated((v) => !v)} />
            Без зарплати
          </label>
          {hasFilters && (
            <button className="btn ghost" onClick={() => {
              setSearch(""); setTeacherId(""); setClubId(""); setOnlyUncalculated(false);
              setStartDate(todayMonthStart()); setEndDate(todayIsoDate());
            }}>Скинути</button>
          )}
          <span className="spacer" />
          <ExportLink href={conductedLessonsLinks.exportUrl(filters)} disabled={(lessons.data ?? []).length === 0} />
          <button className="btn" onClick={() => { setCreatePrefill(null); setCreateOpen(true); }}><IconPlus /><span>Додати урок</span></button>
        </div>

        <div className="metric-strip">
          <div><b>{formatNumber(totals.count)}</b><span>уроків</span></div>
          <div><b>{formatNumber(totals.present)}</b><span>присутні учні</span></div>
          <div><b>{formatNumber(totals.absent)}</b><span>відсутні учні</span></div>
        </div>

        <div className="table-card">
          <div className="table-scroll" ref={scrollRef}>
            <table className="dtable" style={{ minWidth: 1120 }}>
              <thead>
                <tr>
                  <th className="sticky-l" style={{ minWidth: 130 }}>Дата</th>
                  <th style={{ minWidth: 180 }}>Гурток</th>
                  <th style={{ minWidth: 200 }}>Вчителі</th>
                  <th>Присутність</th>
                  <th style={{ minWidth: 150 }}>Відвідуваність</th>
                  <th>Зарплата</th>
                  <th style={{ minWidth: 160 }}>Тема · нотатки</th>
                  <th className="sticky-r" />
                </tr>
              </thead>
              <tbody>
                {lessons.isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 8 }).map((__, j) => (
                      <td key={j}><span className="sk" style={{ display: "block", height: 14 }} /></td>
                    ))}</tr>
                  ))}
                {rows.map((lesson) => {
                  const { date, time } = splitDateTime(lesson.lesson_date);
                  return (
                    <tr key={lesson.id} onClick={() => setEditLesson(lesson)}>
                      <td className="sticky-l tnum-cell">
                        <div style={{ fontWeight: 700 }}>{date}</div>
                        <div className="cell-sub">{time}</div>
                      </td>
                      <td>
                        <div className="cell-name">{lesson.club_name ?? "Без гуртка"}</div>
                        <div className="cell-sub">{lesson.lesson_duration_minutes ?? 0} хв · #{lesson.id}</div>
                      </td>
                      <td>
                        <ul className="vlist olive">
                          {(lesson.teachers.length ? lesson.teachers : [{ full_name: lesson.teacher_name, status: "UNMARKED", teacher_id: 0 }]).map((teacher, idx) => (
                            <li key={`${lesson.id}-${teacher.teacher_id || idx}`}>
                              {teacher.full_name}
                              <span className="cell-sub" style={{ display: "inline", marginLeft: 6 }}>{statusLabel(teacher.status)}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="tnum-cell">
                        <b>{formatNumber(lesson.present_students)}</b>
                        <span className="cell-muted">/{formatNumber(lesson.total_students)}</span>
                        <div className="cell-sub">відсутні {formatNumber(lesson.absent_students)}</div>
                      </td>
                      <td>
                        <span className={`tag ${attendanceTagClass(lesson.attendance_rate)}`}>
                          {Math.round(lesson.attendance_rate)}%
                        </span>
                        <div className="bar" style={{ marginTop: 6 }}>
                          <span style={{ width: `${Math.min(100, Math.max(0, lesson.attendance_rate))}%` }} />
                        </div>
                      </td>
                      <td>
                        {lesson.is_salary_calculated ? (
                          <span className="tag create">нараховано</span>
                        ) : lesson.is_valid_for_salary ? (
                          <span className="tag">не нараховано</span>
                        ) : (
                          <span className="tag">не враховується</span>
                        )}
                      </td>
                      <td>
                        {lesson.lesson_topic && <div style={{ fontWeight: 600 }}>{lesson.lesson_topic}</div>}
                        <div className="cell-sub">{lesson.notes || (lesson.lesson_topic ? "" : "—")}</div>
                      </td>
                      <td className="sticky-r" onClick={(e) => e.stopPropagation()}>
                        <div className="row-actions">
                          {/* Редагування лишається всім: саме там вчитель відмічає присутність */}
                          <button className="row-btn" title="Редагувати" onClick={() => setEditLesson(lesson)}><IconPencil /></button>
                          {canManage && (
                            <button className="row-btn danger" title="Видалити" onClick={() => { setDeleteLesson(lesson); setDeleteWarning(null); }}><IconTrash /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!lessons.isLoading && rows.length === 0 && (
              <div className="table-empty">
                <div className="big">{hasFilters ? "Нічого не знайдено" : "Проведених уроків немає"}</div>
                {hasFilters ? "Спробуйте змінити пошук, період або фільтри" : "Додайте перший проведений урок"}
              </div>
            )}
          </div>
          <div className="table-foot">
            <span>Показано {formatNumber(rows.length)} {rows.length === 1 ? "урок" : "уроків"} за період</span>
          </div>
        </div>
      </div>

      {createOpen && <CreateLessonModal schedules={schedules.data ?? []} initial={createPrefill} onClose={() => setCreateOpen(false)} />}
      {editLesson && <EditLessonModal lesson={editLesson} onClose={() => setEditLesson(null)} />}

      {deleteLesson && (
        <div className="modal-overlay" onClick={() => { setDeleteLesson(null); setDeleteWarning(null); }}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Видалити проведений урок?</h3>
              <button className="close" aria-label="Закрити" onClick={() => { setDeleteLesson(null); setDeleteWarning(null); }}><IconClose /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
                <b>{deleteLesson.club_name}</b> за {splitDateTime(deleteLesson.lesson_date).date} буде видалено.
              </p>
              {deleteWarning && <div className="form-error" style={{ marginTop: 12 }}>{deleteWarning}</div>}
            </div>
            <div className="modal-foot">
              <button className="btn secondary" onClick={() => { setDeleteLesson(null); setDeleteWarning(null); }}>Скасувати</button>
              <button
                className="btn danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: deleteLesson.id, force: !!deleteWarning })}
              >
                {remove.isPending ? "Видаляємо…" : deleteWarning ? "Видалити з усіма даними" : "Видалити"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
