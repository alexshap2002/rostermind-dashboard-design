import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ConfirmDialog, DataTable, DataToolbar, EmptyState, FormModal, PageShell, StatusTag,
} from "../../components/admin/primitives";
import { ApiError } from "../../lib/api";
import { formatNumber, formatUpdatedAt } from "../../lib/format";
import {
  IconCheckSquare, IconPencil, IconPlus, IconSearch, IconTrash,
} from "../../lib/icons";
import { WEEKDAY_FULL, hhmm } from "../schedules/api";
import { botApi, botQueries, type BotSchedule } from "./api";

const OFFSET_OPTIONS = [
  { value: -60, label: "за 60 хв" },
  { value: -30, label: "за 30 хв" },
  { value: -15, label: "за 15 хв" },
  { value: -10, label: "за 10 хв" },
  { value: -5, label: "за 5 хв" },
  { value: 0, label: "на початку уроку" },
  { value: 5, label: "через 5 хв" },
  { value: 10, label: "через 10 хв" },
  { value: 15, label: "через 15 хв" },
  { value: 30, label: "через 30 хв" },
  { value: 60, label: "через 60 хв" },
];

function offsetLabel(mins: number): string {
  const preset = OFFSET_OPTIONS.find((o) => o.value === mins);
  if (preset) return preset.label;
  return mins < 0 ? `за ${Math.abs(mins)} хв` : mins > 0 ? `через ${mins} хв` : "на початку уроку";
}

function scheduleLabel(schedule: BotSchedule["schedule"]) {
  const group = schedule.group_name ? ` · ${schedule.group_name}` : "";
  return `${WEEKDAY_FULL[schedule.weekday]} ${hhmm(schedule.start_time)} · ${schedule.club_name}${group}`;
}

function BotScheduleForm({
  botSchedule,
  onClose,
}: {
  botSchedule: BotSchedule | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const available = useQuery(botQueries.availableSchedules());
  const [scheduleId, setScheduleId] = useState(botSchedule ? String(botSchedule.schedule_id) : "");
  const [enabled, setEnabled] = useState(botSchedule?.enabled ?? true);
  const [offset, setOffset] = useState(botSchedule ? String(botSchedule.offset_minutes) : "-15");
  const [customTime, setCustomTime] = useState(botSchedule?.custom_time ? hhmm(botSchedule.custom_time) : "");
  const [message, setMessage] = useState(botSchedule?.custom_message ?? "");
  const [error, setError] = useState<string | null>(null);

  const scheduleOptions = (available.data ?? []).filter(
    (s) => !s.has_bot_schedule || String(s.id) === scheduleId,
  );

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        enabled,
        // offset і точний час взаємовиключні: якщо задано точний час — offset не діє.
        offset_minutes: customTime ? 0 : Number(offset),
        custom_time: customTime || null,
        custom_message: message.trim() || null,
      };
      return botSchedule
        ? botApi.update(botSchedule.id, payload)
        : botApi.create({ schedule_id: Number(scheduleId), ...payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Не вдалося зберегти розсилку"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!botSchedule && !scheduleId) return setError("Оберіть заняття");
    save.mutate();
  }

  return (
    <FormModal
      title={botSchedule ? "Редагувати розсилку" : "Додати Telegram відмітку"}
      submitLabel={botSchedule ? "Зберегти зміни" : "Додати розсилку"}
      pending={save.isPending}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      {error && <div className="form-error">{error}</div>}
      <div className="fgrid">
        {!botSchedule && (
          <div className="field span-12">
            <label htmlFor="bot-schedule">Заняття *</label>
            <select id="bot-schedule" value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
              <option value="">Оберіть активне заняття…</option>
              {scheduleOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {WEEKDAY_FULL[s.weekday]} {hhmm(s.start_time)} · {s.club_name}
                  {s.group_name ? ` · ${s.group_name}` : ""} · {s.teacher_name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field span-6">
          <label htmlFor="bot-offset">Час відносно уроку</label>
          <select
            id="bot-offset"
            value={offset}
            disabled={!!customTime}
            onChange={(e) => { setOffset(e.target.value); setCustomTime(""); }}
          >
            {(OFFSET_OPTIONS.some((o) => String(o.value) === offset)
              ? OFFSET_OPTIONS
              : [{ value: Number(offset), label: offsetLabel(Number(offset)) }, ...OFFSET_OPTIONS]
            ).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="field span-6">
          <label htmlFor="bot-custom-time">Точний час (замість відносного)</label>
          <input id="bot-custom-time" type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} />
        </div>
        <div className="field span-12">
          <label htmlFor="bot-message">Повідомлення</label>
          <textarea
            id="bot-message"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Залиште порожнім для стандартного повідомлення"
          />
        </div>
        <div className="field span-12">
          <label className={`check${enabled ? " on" : ""}`}>
            <input type="checkbox" checked={enabled} onChange={() => setEnabled((v) => !v)} />
            Розсилка активна
          </label>
        </div>
      </div>
    </FormModal>
  );
}

export function BotPage() {
  const qc = useQueryClient();
  const schedules = useQuery(botQueries.schedules());
  const available = useQuery(botQueries.availableSchedules());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("enabled");
  const [editing, setEditing] = useState<BotSchedule | null | "new">(null);
  const [deleting, setDeleting] = useState<BotSchedule | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (schedules.data ?? []).filter((row) => {
      if (q && ![
        row.schedule.club_name,
        row.schedule.teacher_name,
        row.schedule.group_name,
        row.notification_time_description,
        row.custom_message,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q))) return false;
      if (statusFilter === "enabled" && !row.enabled) return false;
      if (statusFilter === "disabled" && row.enabled) return false;
      return true;
    });
  }, [schedules.data, search, statusFilter]);

  const enabledCount = (schedules.data ?? []).filter((s) => s.enabled).length;
  const withoutBotCount = (available.data ?? []).filter((s) => !s.has_bot_schedule).length;
  const hasFilters = search || statusFilter !== "enabled";

  const toggle = useMutation({
    mutationFn: (row: BotSchedule) => botApi.update(row.id, { enabled: !row.enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Не вдалося змінити статус розсилки"),
  });
  const remove = useMutation({
    mutationFn: (id: number) => botApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleting(null);
    },
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Не вдалося видалити розсилку"),
  });
  const [confirmAction, setConfirmAction] = useState<null | "check" | "generate">(null);
  const check = useMutation({
    mutationFn: () => botApi.checkNotifications(),
    onSuccess: (res) => setActionMessage(res.message),
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Не вдалося перевірити сповіщення"),
  });
  const generate = useMutation({
    mutationFn: () => botApi.generateDailyEvents(),
    onSuccess: (res) => setActionMessage(res.message),
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Не вдалося згенерувати події"),
  });

  return (
    <PageShell
      title="Telegram відмітка"
      subtitle={
        schedules.data
          ? `${formatNumber(schedules.data.length)} розсилок · активних ${formatNumber(enabledCount)}`
          : "Завантаження…"
      }
      actions={<button className="btn" onClick={() => setEditing("new")}><IconPlus />Додати розсилку</button>}
    >
      {actionError && (
        <div className="form-error" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{actionError}</span>
          <button className="link" onClick={() => setActionError(null)}>Закрити</button>
        </div>
      )}
      {actionMessage && (
        <div className="form-ok" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{actionMessage}</span>
          <button className="link" onClick={() => setActionMessage(null)}>Закрити</button>
        </div>
      )}
      <DataToolbar>
        <div className="tsearch">
          <IconSearch />
          <input placeholder="Пошук: гурток, вчитель, група…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="tselect" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="enabled">Активні</option>
          <option value="all">Всі</option>
          <option value="disabled">Вимкнені</option>
        </select>
        {hasFilters && <button className="btn ghost" onClick={() => { setSearch(""); setStatusFilter("enabled"); }}>Скинути</button>}
        <span className="spacer" />
        <button className="btn ghost" disabled={check.isPending} onClick={() => setConfirmAction("check")}><IconCheckSquare />Перевірити зараз</button>
        <button className="btn ghost" disabled={generate.isPending} onClick={() => setConfirmAction("generate")}><IconPlus />Події на сьогодні</button>
      </DataToolbar>

      <div className="metric-strip">
        <div><b>{formatNumber(enabledCount)}</b><span>активні розсилки</span></div>
        <div><b>{formatNumber(withoutBotCount)}</b><span>занять без Telegram відмітки</span></div>
        <div><b>{formatNumber(available.data?.length ?? 0)}</b><span>активні заняття</span></div>
      </div>

      {schedules.isLoading && <EmptyState title="Завантажуємо Telegram розсилки…" />}
      {!schedules.isLoading && filtered.length === 0 && (
        <EmptyState title={hasFilters ? "Нічого не знайдено" : "Розсилок ще немає"}>
          {hasFilters ? "Змініть пошук або фільтр" : "Додайте першу Telegram відмітку для активного заняття"}
        </EmptyState>
      )}
      {filtered.length > 0 && (
        <DataTable>
          <thead>
            <tr>
              <th>Заняття</th>
              <th>Вчителі</th>
              <th>Час відправки</th>
              <th>Статус</th>
              <th>Оновлено</th>
              <th style={{ textAlign: "right" }}>Дії</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} onClick={() => setEditing(row)}>
                <td>
                  <div className="cell-name">{scheduleLabel(row.schedule)}</div>
                  <div className="cell-sub">{row.custom_message ? row.custom_message : "стандартне повідомлення"}</div>
                </td>
                <td>
                  <ul className="vlist olive">
                    {(row.schedule.teacher_names.length ? row.schedule.teacher_names : [row.schedule.teacher_name]).map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </td>
                <td>
                  <div className="cell-name">{row.notification_time_description}</div>
                  <div className="cell-sub">offset {row.offset_minutes} хв{row.custom_time ? ` · ${hhmm(row.custom_time)}` : ""}</div>
                </td>
                <td><StatusTag tone={row.enabled ? "create" : "neutral"}>{row.status_description}</StatusTag></td>
                <td className="tnum-cell">{formatUpdatedAt(row.updated_at)}</td>
                <td>
                  <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`switch${row.enabled ? " on" : ""}`}
                      role="switch"
                      aria-checked={row.enabled}
                      title={row.enabled ? "Вимкнути" : "Увімкнути"}
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate(row)}
                    />
                    <button className="row-btn" title="Редагувати" onClick={() => setEditing(row)}><IconPencil /></button>
                    <button className="row-btn danger" title="Видалити" onClick={() => setDeleting(row)}><IconTrash /></button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      {editing !== null && <BotScheduleForm botSchedule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Видалити Telegram розсилку?"
          confirmLabel="Видалити"
          pending={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.id)}
        >
          <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
            <b>{deleting.schedule.club_name}</b> · {WEEKDAY_FULL[deleting.schedule.weekday]} {hhmm(deleting.schedule.start_time)}.
            Майбутні автоматичні нагадування для цієї розсилки будуть прибрані.
          </p>
        </ConfirmDialog>
      )}

      {confirmAction === "check" && (
        <ConfirmDialog
          title="Перевірити й надіслати сповіщення зараз?"
          confirmLabel="Так, перевірити"
          danger={false}
          pending={check.isPending}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => { setConfirmAction(null); check.mutate(); }}
        >
          <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
            Система перевірить розклади, чий час нагадування настав, і <b>реально надішле</b> повідомлення
            в Telegram (вони будуть позначені як надіслані). Виконуйте лише свідомо.
          </p>
        </ConfirmDialog>
      )}

      {confirmAction === "generate" && (
        <ConfirmDialog
          title="Згенерувати події на сьогодні?"
          confirmLabel="Згенерувати"
          danger={false}
          pending={generate.isPending}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => { setConfirmAction(null); generate.mutate(); }}
        >
          <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
            Буде створено заплановані заняття на сьогодні для активних розкладів (наявні не дублюються).
          </p>
        </ConfirmDialog>
      )}
    </PageShell>
  );
}
