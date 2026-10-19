import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { IconClose } from "../../lib/icons";
import type { Club } from "../students/types";
import type { Teacher } from "../teachers/types";
import { schedulesApi, WEEKDAY_FULL, hhmm, type ScheduleInput, type ScheduleV2 } from "./api";

interface Props {
  schedule: ScheduleV2 | null; // null = створення
  clubs: Club[];
  teachers: Teacher[];
  onClose: () => void;
}

export function ScheduleFormModal({ schedule, clubs, teachers, onClose }: Props) {
  const qc = useQueryClient();
  const [clubId, setClubId] = useState(schedule ? String(schedule.club_id) : "");
  const [weekday, setWeekday] = useState(schedule ? String(schedule.weekday) : "1");
  const [startTime, setStartTime] = useState(schedule ? hhmm(schedule.start_time) : "15:00");
  const [groupName, setGroupName] = useState(schedule?.group_name ?? "Група 1");
  const [active, setActive] = useState(schedule?.active ?? true);
  // Порядок вибору зберігається у бекенді (перший = основний), але адміну не показується
  const [teacherIds, setTeacherIds] = useState<number[]>(
    () => (schedule ? [...schedule.teachers].sort((a, b) => a.order - b.order).map((t) => t.teacher_id) : []),
  );
  const [error, setError] = useState<string | null>(null);

  function toggleTeacher(id: number) {
    setTeacherIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const save = useMutation({
    mutationFn: () => {
      const payload: ScheduleInput = {
        club_id: Number(clubId),
        weekday: Number(weekday),
        start_time: startTime,
        group_name: groupName.trim() || "Група 1",
        active,
        // is_primary/order потрібні бекенду; перший обраний = основний (невидимо для адміна)
        teachers: teacherIds.map((teacher_id, i) => ({ teacher_id, is_primary: i === 0, order: i })),
      };
      return schedule ? schedulesApi.update(schedule.id, payload) : schedulesApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Не вдалося зберегти. Спробуйте ще раз."),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clubId) return setError("Оберіть гурток");
    if (!startTime) return setError("Вкажіть час початку");
    if (teacherIds.length === 0) return setError("Оберіть хоча б одного вчителя");
    save.mutate();
  }

  // Як у legacy: у розклад можна додати лише вчителів із підключеним Telegram
  // (саме вони отримують нагадування та відмітки). Уже призначених лишаємо видимими.
  const activeTeachers = teachers
    .filter((t) => (t.active && t.tg_chat_id != null) || teacherIds.includes(t.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "uk"));
  const noTelegramCount = teachers.filter((t) => t.active && t.tg_chat_id == null).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="modal-head">
          <h3>{schedule ? "Редагувати заняття" : "Додати нове заняття"}</h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="fsection first">Заняття</div>
          <div className="fgrid">
            <div className="field span-6">
              <label htmlFor="s-club">Гурток *</label>
              <select id="s-club" value={clubId} onChange={(e) => setClubId(e.target.value)} required>
                <option value="" disabled>Оберіть гурток…</option>
                {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field span-6">
              <label htmlFor="s-group">Назва групи</label>
              <input id="s-group" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Група 1" />
            </div>
            <div className="field span-6">
              <label htmlFor="s-weekday">День тижня *</label>
              <select id="s-weekday" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
                {Object.entries(WEEKDAY_FULL).map(([v, name]) => (
                  <option key={v} value={v}>{name}</option>
                ))}
              </select>
            </div>
            <div className="field span-6">
              <label htmlFor="s-time">Час початку *</label>
              <input id="s-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </div>
            <div className="field span-12">
              <button
                type="button"
                className={`bigtoggle${active ? " on" : ""}`}
                onClick={() => setActive((v) => !v)}
                aria-pressed={active}
              >
                <span className="sw" />
                <span className="bigtoggle-txt">
                  <b>{active ? "Активне заняття" : "Неактивне заняття"}</b>
                  <span>Генеруються уроки в календарі й нагадування вчителям</span>
                </span>
              </button>
            </div>
          </div>

          <div className="fsection">Вчителі ({teacherIds.length} обрано)</div>
          {activeTeachers.length === 0 ? (
            <div className="empty-inline">
              Немає вчителів із підключеним Telegram — спочатку запросіть їх у розділі «Запрошення вчителів»
            </div>
          ) : (
            <div className="check-grid">
              {activeTeachers.map((t) => (
                <label className={`check${teacherIds.includes(t.id) ? " on" : ""}`} key={t.id}>
                  <input type="checkbox" checked={teacherIds.includes(t.id)} onChange={() => toggleTeacher(t.id)} />
                  <span style={{ flex: 1 }}>{t.full_name}</span>
                </label>
              ))}
            </div>
          )}
          <p className="fsection-hint" style={{ marginTop: 8 }}>
            Показані лише вчителі з підключеним Telegram — саме вони отримують нагадування й відмітки.
            {noTelegramCount > 0 ? ` Ще ${noTelegramCount} без Telegram приховано.` : ""}
          </p>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="btn" disabled={save.isPending}>
            {save.isPending ? "Зберігаємо…" : schedule ? "Зберегти зміни" : "Додати заняття"}
          </button>
        </div>
      </form>
    </div>
  );
}
