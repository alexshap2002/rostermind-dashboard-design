import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { IconClose, IconPlus, IconSearch } from "../../lib/icons";
import {
  schedulesApi, schedulesQueries, WEEKDAY_FULL, WEEKDAY_SHORT, hhmm, type ScheduleV2,
} from "../schedules/api";
import { studentsQueries } from "./api";

interface Props {
  studentId: number;
  studentName: string;
  onClose: () => void;
}

const IconMinus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14" /></svg>
);

function scheduleMeta(s: ScheduleV2): string {
  const parts: string[] = [];
  if (s.primary_teacher_name) parts.push(s.primary_teacher_name);
  if (s.group_name) parts.push(s.group_name);
  return parts.join(" · ");
}

export function StudentScheduleModal({ studentId, studentName, onClose }: Props) {
  const qc = useQueryClient();
  const schedules = useQuery(schedulesQueries.list());
  const full = useQuery(studentsQueries.full(studentId));
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["students", "full", studentId] });
    qc.invalidateQueries({ queryKey: ["schedules"] });
    qc.invalidateQueries({ queryKey: ["enrollments"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const enroll = useMutation({
    mutationFn: (scheduleId: number) => schedulesApi.enroll(studentId, scheduleId),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Не вдалося записати на розклад"),
  });
  const unenroll = useMutation({
    mutationFn: (scheduleId: number) => schedulesApi.unenroll(studentId, scheduleId),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Не вдалося відписати з розкладу"),
  });

  const enrolledIds = useMemo(
    () => new Set((full.data?.enrolled_schedules ?? []).map((e) => e.schedule_id)),
    [full.data],
  );

  const all = schedules.data ?? [];
  const enrolled = all.filter((s) => enrolledIds.has(s.id));
  const q = search.trim().toLowerCase();
  const available = all
    .filter((s) => s.active && !enrolledIds.has(s.id))
    .filter((s) => !q || `${s.club_name ?? ""} ${WEEKDAY_FULL[s.weekday]} ${scheduleMeta(s)}`.toLowerCase().includes(q));

  const loading = schedules.isLoading || full.isLoading;
  const busy = enroll.isPending || unenroll.isPending;

  const row = (s: ScheduleV2, action: "add" | "remove") => (
    <div className="pane-row" key={s.id}>
      <span className="day-badge"><b>{WEEKDAY_SHORT[s.weekday]}</b><span>{hhmm(s.start_time)}</span></span>
      <div className="pane-main">
        <div className="pane-name">{s.club_name ?? "Без гуртка"}</div>
        <div className="pane-meta">
          {scheduleMeta(s) || WEEKDAY_FULL[s.weekday]}
          {!s.active ? " · неактивний" : ""}
        </div>
      </div>
      {action === "remove" ? (
        <button type="button" className="row-btn danger" title="Відписати з розкладу" disabled={busy} onClick={() => unenroll.mutate(s.id)}>
          <IconMinus />
        </button>
      ) : (
        <button type="button" className="row-btn add" title="Записати на розклад" disabled={busy} onClick={() => enroll.mutate(s.id)}>
          <IconPlus />
        </button>
      )}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Розклад учня · {studentName}</h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {error && (
            <div className="form-error" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span>{error}</span>
              <button type="button" className="link" onClick={() => setError(null)}>Закрити</button>
            </div>
          )}

          {loading && <div className="empty-inline">Завантаження розкладів…</div>}

          {!loading && (
            <div className="duo-pane">
              <div className="pane">
                <div className="pane-head">
                  Записані розклади <span className="chip">{enrolled.length}</span>
                </div>
                <div className="pane-list">
                  {enrolled.length === 0 && <div className="empty-inline">Учень ще не записаний на розклади</div>}
                  {enrolled.map((s) => row(s, "remove"))}
                </div>
              </div>

              <div className="pane">
                <div className="pane-head">
                  Доступні розклади <span className="chip">{available.length}</span>
                </div>
                <div className="tsearch" style={{ minWidth: 0, maxWidth: "none", marginBottom: 10 }}>
                  <IconSearch />
                  <input
                    placeholder="Пошук: гурток, день, викладач…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="pane-list">
                  {available.length === 0 && (
                    <div className="empty-inline">{q ? "Нічого не знайдено" : "Немає доступних розкладів"}</div>
                  )}
                  {available.map((s) => row(s, "add"))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}
