import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog, FormModal, PageShell, useCanManage } from "../../components/admin/primitives";
import { ApiError } from "../../lib/api";
import { formatNumber, formatUpdatedAt } from "../../lib/format";
import { IconChevron } from "../../lib/icons";
import { clubsQueries } from "../clubs/api";
import { teachersQueries } from "../teachers/api";
import {
  calendarApi, calendarQueries, type CalendarEvent, type CalendarFilters, type CalendarException,
} from "./api";

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const HOUR_PX = 80;

function mondayOf(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** "HH:MM[:SS]" → хвилини від початку доби. */
function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
function hhmm(t: string): string {
  return t.slice(0, 5);
}

function statusLabel(status: string): string {
  switch (status) {
    case "PLANNED": return "Заплановано";
    case "SENT": return "Надіслано";
    case "COMPLETED": return "Проведено";
    case "CANCELLED": return "Скасовано";
    case "SKIPPED": return "Пропущено";
    default: return status;
  }
}
/** Клас кольору блока за статусом. */
function statusCls(status: string): string {
  switch (status) {
    case "PLANNED": return "planned";
    case "SENT": return "sent";
    case "COMPLETED": return "done";
    case "CANCELLED": return "cancelled";
    case "SKIPPED": return "skipped";
    default: return "planned";
  }
}

/** Розкладає накладені події доби у смуги (lanes): кожна отримує lane і загальну к-сть смуг у своєму кластері. */
interface Positioned {
  ev: CalendarEvent;
  start: number;
  end: number;
  lane: number;
  lanes: number;
}
function layoutDay(events: CalendarEvent[]): Positioned[] {
  const evs = events
    .map((ev) => ({ ev, start: toMin(ev.start_time), end: Math.max(toMin(ev.end_time), toMin(ev.start_time) + 30) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Positioned[] = [];
  let cluster: (typeof evs[number] & { lane?: number })[] = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    for (const e of cluster) {
      let placed = -1;
      for (let i = 0; i < laneEnds.length; i++) {
        if (e.start >= laneEnds[i]) { laneEnds[i] = e.end; placed = i; break; }
      }
      if (placed < 0) { laneEnds.push(e.end); placed = laneEnds.length - 1; }
      e.lane = placed;
    }
    const lanes = laneEnds.length;
    for (const e of cluster) out.push({ ev: e.ev, start: e.start, end: e.end, lane: e.lane ?? 0, lanes });
    cluster = [];
    clusterEnd = -1;
  };
  for (const e of evs) {
    if (cluster.length && e.start >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.end);
  }
  flush();
  return out;
}

function VacationForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const today = isoDate(new Date());
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const affected = useQuery(calendarQueries.events({ startDate, endDate }));
  const plannedToRemove = (affected.data ?? []).filter((e) => e.status === "PLANNED").length;
  const save = useMutation({
    mutationFn: () => calendarApi.createExceptions({ start_date: startDate, end_date: endDate, reason: reason.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Не вдалося створити канікули"),
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) return setError("Вкажіть причину");
    if (endDate < startDate) return setError("Дата завершення має бути не раніше початку");
    save.mutate();
  }
  return (
    <FormModal title="Додати канікули / вихідні" submitLabel="Створити період" pending={save.isPending} onSubmit={onSubmit} onClose={onClose}>
      {error && <div className="form-error">{error}</div>}
      {plannedToRemove > 0 && (
        <div className="form-error" style={{ background: "var(--gold-soft)", color: "var(--gold-text)", borderColor: "rgba(196,134,28,.35)" }}>
          У вибраному діапазоні буде скасовано/видалено запланованих занять: <b>{plannedToRemove}</b>.
        </div>
      )}
      <div className="fgrid">
        <div className="field span-6">
          <label htmlFor="vac-start">Дата з *</label>
          <input id="vac-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field span-6">
          <label htmlFor="vac-end">Дата по *</label>
          <input id="vac-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="field span-12">
          <label htmlFor="vac-reason">Причина *</label>
          <input id="vac-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Наприклад: зимові канікули" />
        </div>
      </div>
    </FormModal>
  );
}

export function CalendarPage() {
  const qc = useQueryClient();
  const canManage = useCanManage();
  const [anchor, setAnchor] = useState(() => mondayOf(new Date()));
  const [clubId, setClubId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [vacationOpen, setVacationOpen] = useState(false);
  const [eventAction, setEventAction] = useState<CalendarEvent | null>(null);
  const [exceptionDelete, setExceptionDelete] = useState<CalendarException | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const weekStart = anchor;
  const weekEnd = addDays(anchor, 6);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return { date: d, iso: isoDate(d), label: WEEKDAY_SHORT[i], dm: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`, isToday: isoDate(d) === isoDate(new Date()) };
    }),
    [weekStart],
  );

  const filters: CalendarFilters = { startDate: isoDate(weekStart), endDate: isoDate(weekEnd), clubId, teacherId };
  const events = useQuery(calendarQueries.events(filters));
  const exceptions = useQuery(calendarQueries.exceptions(isoDate(weekStart), isoDate(weekEnd)));
  const clubs = useQuery(clubsQueries.list());
  const teachers = useQuery({ ...teachersQueries.list(), enabled: canManage });

  const evByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events.data ?? []) {
      const arr = map.get(ev.date) ?? [];
      arr.push(ev);
      map.set(ev.date, arr);
    }
    return map;
  }, [events.data]);

  const holidayByDay = useMemo(() => {
    const map = new Map<string, CalendarException>();
    for (const exc of exceptions.data ?? []) map.set(exc.date, exc);
    return map;
  }, [exceptions.data]);

  // Межі сітки по годинах — від найранішого до найпізнішого уроку, але не вужче 8–20
  const [gridStart, gridEnd] = useMemo(() => {
    const all = (events.data ?? []).flatMap((e) => [toMin(e.start_time), toMin(e.end_time)]);
    const minH = all.length ? Math.floor(Math.min(...all) / 60) : 8;
    const maxH = all.length ? Math.ceil(Math.max(...all) / 60) : 20;
    return [Math.min(8, minH), Math.max(20, maxH)];
  }, [events.data]);
  const hours = Array.from({ length: gridEnd - gridStart }, (_, i) => gridStart + i);
  const bodyHeight = hours.length * HOUR_PX;

  // Лінія «зараз» — лише якщо сьогодні у видимому тижні й у межах сітки
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayIso = isoDate(now);
  const nowTop = ((nowMin - gridStart * 60) / 60) * HOUR_PX;
  const showNow = nowMin >= gridStart * 60 && nowMin <= gridEnd * 60;

  const cancelledCount = (events.data ?? []).filter((e) => e.status === "CANCELLED").length;

  const changeEventStatus = useMutation({
    mutationFn: (event: CalendarEvent) =>
      event.status === "CANCELLED" ? calendarApi.restoreEvent(event.id) : calendarApi.cancelEvent(event.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setEventAction(null);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Не вдалося змінити статус уроку"),
  });
  const deleteException = useMutation({
    mutationFn: (id: number) => calendarApi.deleteException(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setExceptionDelete(null);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Не вдалося видалити вихідний день"),
  });

  const weekLabel = `${days[0].dm} — ${days[6].dm}`;

  return (
    <PageShell
      title="Календар"
      subtitle={
        events.data
          ? `${formatNumber(events.data.length)} уроків цього тижня · ${formatNumber(exceptions.data?.length ?? 0)} вихідних`
          : "Завантаження…"
      }
      actions={canManage ? <button className="btn" onClick={() => setVacationOpen(true)}>Канікули / вихідні</button> : undefined}
    >
      {actionError && (
        <div className="form-error" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{actionError}</span>
          <button className="link" onClick={() => setActionError(null)}>Закрити</button>
        </div>
      )}

      <div className="cal-bar">
        <div className="cal-nav">
          <button className="icon-btn" aria-label="Попередній тиждень" onClick={() => setAnchor(addDays(anchor, -7))}>
            <IconChevron style={{ transform: "rotate(90deg)" }} />
          </button>
          <span className="cal-week">{weekLabel}</span>
          <button className="icon-btn" aria-label="Наступний тиждень" onClick={() => setAnchor(addDays(anchor, 7))}>
            <IconChevron style={{ transform: "rotate(-90deg)" }} />
          </button>
          <button className="btn ghost" onClick={() => setAnchor(mondayOf(new Date()))}>Цей тиждень</button>
        </div>
        <span className="spacer" />
        <select className="tselect" value={clubId} onChange={(e) => setClubId(e.target.value)}>
          <option value="">Гурток: всі</option>
          {(clubs.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {canManage && (
          <select className="tselect" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">Вчитель: всі</option>
            {(teachers.data ?? []).filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        )}
      </div>

      <div className="metric-strip">
        <div><b>{formatNumber(events.data?.length ?? 0)}</b><span>уроки цього тижня</span></div>
        <div><b>{formatNumber(cancelledCount)}</b><span>скасовані</span></div>
        <div><b>{formatNumber(exceptions.data?.length ?? 0)}</b><span>вихідні / канікули</span></div>
      </div>

      <div className="cal">
        {/* Шапка з днями */}
        <div className="cal-head">
          <div className="cal-gutter-head" />
          {days.map((d) => (
            <div key={d.iso} className={`cal-day-head${d.isToday ? " today" : ""}${holidayByDay.has(d.iso) ? " holiday" : ""}`}>
              <span className="cal-dow">{d.label}</span>
              <span className="cal-dm">{d.dm}</span>
            </div>
          ))}
        </div>

        {/* Тіло: вісь годин + 7 колонок */}
        <div className="cal-body" style={{ height: bodyHeight }}>
          <div className="cal-gutter">
            {hours.map((h) => (
              <div className="cal-hour" key={h} style={{ height: HOUR_PX }}><span>{pad(h)}:00</span></div>
            ))}
          </div>
          {days.map((d) => {
            const holiday = holidayByDay.get(d.iso);
            const positioned = layoutDay(evByDay.get(d.iso) ?? []);
            return (
              <div key={d.iso} className={`cal-col${d.isToday ? " today" : ""}${holiday ? " holiday" : ""}`}>
                {hours.map((h) => <div key={h} className="cal-cell" style={{ height: HOUR_PX }} />)}
                {holiday && (
                  <button
                    className="cal-holiday"
                    title={`Вихідний: ${holiday.reason}. Натисніть, щоб прибрати.`}
                    onClick={() => setExceptionDelete(holiday)}
                  >
                    {holiday.reason}
                  </button>
                )}
                {d.iso === todayIso && showNow && <div className="cal-now" style={{ top: nowTop }} />}
                {positioned.map(({ ev, start, end, lane, lanes }, idx) => {
                  const top = ((start - gridStart * 60) / 60) * HOUR_PX;
                  const height = Math.max(((end - start) / 60) * HOUR_PX - 3, 24);
                  const teachers = ev.teacher_names.length ? ev.teacher_names : [ev.teacher_name];
                  return (
                    <button
                      key={ev.id}
                      className={`cal-event ${statusCls(ev.status)}`}
                      style={{
                        top,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        animationDelay: `${Math.min(idx * 0.03, 0.24)}s`,
                      }}
                      title={`${ev.club_name} · ${hhmm(ev.start_time)}–${hhmm(ev.end_time)}\n${teachers.join(", ")}\n${statusLabel(ev.status)}`}
                      disabled={!canManage || ev.status === "COMPLETED" || ev.status === "SKIPPED"}
                      onClick={() => { if (canManage) setEventAction(ev); }}
                    >
                      <span className="cal-event-time">{hhmm(ev.start_time)}</span>
                      <span className="cal-event-title">{ev.club_name}</span>
                      <span className="cal-event-sub">{teachers.join(", ")}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Легенда */}
      <div className="cal-legend">
        <span className="cal-lg planned">Заплановано</span>
        <span className="cal-lg sent">Надіслано</span>
        <span className="cal-lg done">Проведено</span>
        <span className="cal-lg cancelled">Скасовано</span>
        <span className="cal-lg holiday">Канікули / вихідний</span>
      </div>

      {vacationOpen && <VacationForm onClose={() => setVacationOpen(false)} />}
      {eventAction && (
        <ConfirmDialog
          title={eventAction.status === "CANCELLED" ? "Відновити урок?" : "Скасувати урок?"}
          confirmLabel={eventAction.status === "CANCELLED" ? "Відновити" : "Скасувати"}
          pending={changeEventStatus.isPending}
          danger={eventAction.status !== "CANCELLED"}
          onClose={() => setEventAction(null)}
          onConfirm={() => changeEventStatus.mutate(eventAction)}
        >
          <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
            <b>{eventAction.club_name}</b> · {eventAction.date} {hhmm(eventAction.start_time)}.
            {eventAction.status === "CANCELLED"
              ? " Урок повернеться у заплановані."
              : " Скасований урок не запустить Telegram-нагадування."}
          </p>
        </ConfirmDialog>
      )}
      {exceptionDelete && (
        <ConfirmDialog
          title="Прибрати вихідний день?"
          confirmLabel="Прибрати"
          pending={deleteException.isPending}
          onClose={() => setExceptionDelete(null)}
          onConfirm={() => deleteException.mutate(exceptionDelete.id)}
        >
          <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
            <b>{exceptionDelete.date}</b> · {exceptionDelete.reason}. Після видалення система спробує відновити події на цю дату.
          </p>
          <p className="cell-sub">Створено {formatUpdatedAt(exceptionDelete.created_at)}</p>
        </ConfirmDialog>
      )}
    </PageShell>
  );
}
