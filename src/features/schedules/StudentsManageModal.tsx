import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { IconClose, IconPlus, IconSearch } from "../../lib/icons";
import { schedulesApi, schedulesQueries, WEEKDAY_FULL, hhmm, type ManagedStudent, type ScheduleV2 } from "./api";

interface Props {
  schedule: ScheduleV2;
  onClose: () => void;
}

const IconMinus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14" /></svg>
);

function studentLabel(s: ManagedStudent): string {
  return `${s.last_name} ${s.first_name}`;
}
function studentMeta(s: ManagedStudent): string {
  const parts = [];
  if (s.age != null) parts.push(`${s.age} р.`);
  if (s.grade) parts.push(`${s.grade} клас`);
  return parts.join(" · ");
}

export function StudentsManageModal({ schedule, onClose }: Props) {
  const qc = useQueryClient();
  const mgmt = useQuery(schedulesQueries.studentsManagement(schedule.id));
  const [searchAvailable, setSearchAvailable] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["schedules"] });
    qc.invalidateQueries({ queryKey: ["enrollments"] });
  };

  const enroll = useMutation({
    mutationFn: (studentId: number) => schedulesApi.enroll(studentId, schedule.id),
    onSuccess: invalidate,
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Не вдалося записати учня"),
  });
  const unenroll = useMutation({
    mutationFn: (studentId: number) => schedulesApi.unenroll(studentId, schedule.id),
    onSuccess: invalidate,
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Не вдалося відписати учня"),
  });

  const data = mgmt.data;
  const q = searchAvailable.trim().toLowerCase();
  const available = (data?.available_students ?? []).filter(
    (s) => !q || studentLabel(s).toLowerCase().includes(q),
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            Учні групи · {schedule.club_name}
            <span className="chip" style={{ marginLeft: 10 }}>
              {WEEKDAY_FULL[schedule.weekday]} {hhmm(schedule.start_time)}
              {schedule.group_name ? ` · ${schedule.group_name}` : ""}
            </span>
          </h3>
          <button className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {error && (
            <div className="form-error" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span>{error}</span>
              <button className="link" onClick={() => setError(null)}>Закрити</button>
            </div>
          )}

          {mgmt.isLoading && <div className="empty-inline">Завантаження учнів…</div>}

          {data && (
            <div className="duo-pane">
              <div className="pane">
                <div className="pane-head">
                  Записані учні <span className="chip">{data.enrolled_students.length}</span>
                </div>
                <div className="pane-list">
                  {data.enrolled_students.length === 0 && (
                    <div className="empty-inline">У групі поки нікого немає</div>
                  )}
                  {data.enrolled_students.map((s) => (
                    <div className="pane-row" key={s.id}>
                      <div>
                        <div className="pane-name">{studentLabel(s)}</div>
                        <div className="pane-meta">{studentMeta(s)}</div>
                      </div>
                      <button
                        className="row-btn danger"
                        title="Відписати з групи"
                        disabled={unenroll.isPending}
                        onClick={() => unenroll.mutate(s.id)}
                      >
                        <IconMinus />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pane">
                <div className="pane-head">
                  Доступні учні <span className="chip">{data.available_students.length}</span>
                </div>
                <div className="tsearch" style={{ minWidth: 0, maxWidth: "none", marginBottom: 10 }}>
                  <IconSearch />
                  <input
                    placeholder="Пошук серед доступних…"
                    value={searchAvailable}
                    onChange={(e) => setSearchAvailable(e.target.value)}
                  />
                </div>
                <div className="pane-list">
                  {available.length === 0 && (
                    <div className="empty-inline">{q ? "Нікого не знайдено" : "Всі учні вже записані"}</div>
                  )}
                  {available.map((s) => (
                    <div className="pane-row" key={s.id}>
                      <div>
                        <div className="pane-name">{studentLabel(s)}</div>
                        <div className="pane-meta">
                          {studentMeta(s)}
                          {s.enrolled_clubs.length > 0 && ` · ${s.enrolled_clubs.join(", ")}`}
                        </div>
                      </div>
                      <button
                        className="row-btn add"
                        title="Записати в групу"
                        disabled={enroll.isPending}
                        onClick={() => enroll.mutate(s.id)}
                      >
                        <IconPlus />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}
