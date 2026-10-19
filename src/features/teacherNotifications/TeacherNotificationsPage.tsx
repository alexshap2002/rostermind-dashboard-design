import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, PageShell, StatusTag } from "../../components/admin/primitives";
import { ApiError } from "../../lib/api";
import { formatNumber, formatUpdatedAt } from "../../lib/format";
import { IconSearch, IconSend } from "../../lib/icons";
import {
  teacherNotificationQueries, teacherNotificationsApi,
  type TeacherNotificationListItem, type TeacherNotificationPayload,
} from "./api";

function reminderOn(item: TeacherNotificationListItem): boolean {
  return item.unmarked_first_enabled || item.unmarked_second_enabled;
}

function clampDelay(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function TeacherReminderPanel({ teacher }: { teacher: TeacherNotificationListItem }) {
  const qc = useQueryClient();
  const settings = useQuery(teacherNotificationQueries.settings(teacher.teacher_id));

  const [firstEnabled, setFirstEnabled] = useState(false);
  const [firstDelay, setFirstDelay] = useState("60");
  const [secondEnabled, setSecondEnabled] = useState(false);
  const [secondDelay, setSecondDelay] = useState("180");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setFirstEnabled(settings.data.unmarked_first_enabled);
    setFirstDelay(String(settings.data.unmarked_first_delay_minutes));
    setSecondEnabled(settings.data.unmarked_second_enabled);
    setSecondDelay(String(settings.data.unmarked_second_delay_minutes));
  }, [settings.data]);

  const disabled = !teacher.editable || !teacher.has_telegram;

  const save = useMutation({
    mutationFn: () => {
      const base = settings.data;
      // Нагадування про урок (next-lesson) у цьому інтерфейсі не показуємо — передаємо
      // наявні значення без змін, щоб не зачепити приховану частину налаштувань.
      const payload: TeacherNotificationPayload = {
        next_lesson_mode: base?.next_lesson_mode ?? "off",
        next_lesson_offset_minutes: base?.next_lesson_offset_minutes ?? 120,
        next_lesson_daily_digest_time: base?.next_lesson_daily_digest_time ?? "08:00:00",
        next_lesson_include_students: base?.next_lesson_include_students ?? false,
        unmarked_first_enabled: firstEnabled,
        unmarked_first_delay_minutes: clampDelay(firstDelay),
        unmarked_second_enabled: secondEnabled,
        unmarked_second_delay_minutes: clampDelay(secondDelay),
      };
      return teacherNotificationsApi.update(teacher.teacher_id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teacher-notifications"] });
      setOk("Налаштування збережено");
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Не вдалося зберегти налаштування"),
  });

  const test = useMutation({
    mutationFn: () => teacherNotificationsApi.test(teacher.teacher_id),
    onSuccess: () => setOk("Тестове повідомлення надіслано"),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Не вдалося надіслати тест"),
  });

  function onSave() {
    setError(null);
    setOk(null);
    if (firstEnabled && (clampDelay(firstDelay) < 5 || clampDelay(firstDelay) > 1440)) {
      return setError("Затримка першого нагадування — від 5 до 1440 хвилин");
    }
    if (secondEnabled && (clampDelay(secondDelay) < 5 || clampDelay(secondDelay) > 1440)) {
      return setError("Затримка повторного нагадування — від 5 до 1440 хвилин");
    }
    if (firstEnabled && secondEnabled && clampDelay(secondDelay) <= clampDelay(firstDelay)) {
      return setError("Повторне нагадування має спрацьовувати пізніше за перше");
    }
    save.mutate();
  }

  return (
    <div className="tn-panel">
      <header className="tn-phead">
        <div className="tn-pname">
          <span className="tn-avatar">{teacher.teacher_full_name.charAt(0)}</span>
          <div>
            <b>{teacher.teacher_full_name}</b>
            <span className="tn-pmeta">
              Оновлено {teacher.updated_at ? formatUpdatedAt(teacher.updated_at) : "—"}
            </span>
          </div>
        </div>
        <StatusTag tone={teacher.has_telegram ? "create" : "neutral"}>{teacher.telegram_status}</StatusTag>
      </header>

      {!teacher.has_telegram && (
        <div className="tn-notice">
          У вчителя не підключений Telegram. Нагадування надсилаються лише в Telegram, тож спершу
          підключіть чат у картці вчителя.
        </div>
      )}

      <p className="tn-lead">
        Якщо вчитель не відмітив присутність після початку уроку, бот нагадає йому про це в Telegram.
        Можна ввімкнути перше й повторне нагадування.
      </p>

      {settings.isLoading ? (
        <div className="empty-inline">Завантажуємо налаштування…</div>
      ) : (
        <>
          <div className="tn-rule">
            <button
              type="button"
              className={`bigtoggle${firstEnabled ? " on" : ""}`}
              onClick={() => setFirstEnabled((v) => !v)}
              aria-pressed={firstEnabled}
              disabled={disabled}
            >
              <span className="sw" />
              <span className="bigtoggle-txt">
                <b>Перше нагадування</b>
                <span>Перший сигнал після початку уроку</span>
              </span>
            </button>
            <label className={`tn-delay${firstEnabled ? "" : " off"}`}>
              <span>через</span>
              <input
                type="number" min={5} max={1440} value={firstDelay}
                onChange={(e) => setFirstDelay(e.target.value)}
                disabled={disabled || !firstEnabled}
              />
              <span>хв</span>
            </label>
          </div>

          <div className="tn-rule">
            <button
              type="button"
              className={`bigtoggle${secondEnabled ? " on" : ""}`}
              onClick={() => setSecondEnabled((v) => !v)}
              aria-pressed={secondEnabled}
              disabled={disabled}
            >
              <span className="sw" />
              <span className="bigtoggle-txt">
                <b>Повторне нагадування</b>
                <span>Якщо відмітки досі немає</span>
              </span>
            </button>
            <label className={`tn-delay${secondEnabled ? "" : " off"}`}>
              <span>через</span>
              <input
                type="number" min={5} max={1440} value={secondDelay}
                onChange={(e) => setSecondDelay(e.target.value)}
                disabled={disabled || !secondEnabled}
              />
              <span>хв</span>
            </label>
          </div>

          <div className="tn-timeline" aria-hidden>
            <div className="tn-tl-node">
              <span className="tn-tl-dot start" />
              <b>Початок уроку</b>
              <span>0 хв</span>
            </div>
            <div className={`tn-tl-seg${firstEnabled ? " on" : ""}`} />
            <div className={`tn-tl-node${firstEnabled ? " on" : " muted"}`}>
              <span className="tn-tl-dot" />
              <b>Перше</b>
              <span>{firstEnabled ? `+${clampDelay(firstDelay)} хв` : "вимкнено"}</span>
            </div>
            <div className={`tn-tl-seg${secondEnabled ? " on" : ""}`} />
            <div className={`tn-tl-node${secondEnabled ? " on" : " muted"}`}>
              <span className="tn-tl-dot" />
              <b>Повторне</b>
              <span>{secondEnabled ? `+${clampDelay(secondDelay)} хв` : "вимкнено"}</span>
            </div>
          </div>

          {error && <div className="form-error" style={{ marginTop: 4 }}>{error}</div>}
          {ok && <div className="form-ok" style={{ marginTop: 4 }}>{ok}</div>}

          <div className="tn-actions">
            <button className="btn primary" onClick={onSave} disabled={disabled || save.isPending}>
              {save.isPending ? "Зберігаємо…" : "Зберегти"}
            </button>
            <button
              className="btn ghost"
              onClick={() => { setError(null); setOk(null); test.mutate(); }}
              disabled={!teacher.has_telegram || test.isPending}
            >
              <IconSend />Надіслати тест
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function TeacherNotificationsPage() {
  const teachers = useQuery(teacherNotificationQueries.list());
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const list = teachers.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) => t.teacher_full_name.toLowerCase().includes(q));
  }, [list, search]);

  useEffect(() => {
    if (!filtered.length) { setSelectedId(null); return; }
    if (selectedId == null || !filtered.some((t) => t.teacher_id === selectedId)) {
      setSelectedId(filtered[0].teacher_id);
    }
  }, [filtered, selectedId]);

  const selected = list.find((t) => t.teacher_id === selectedId) ?? null;
  const telegramCount = list.filter((t) => t.has_telegram).length;
  const activeCount = list.filter(reminderOn).length;

  return (
    <PageShell
      title="Сповіщення вчителям"
      subtitle={
        teachers.data
          ? `${formatNumber(list.length)} вчителів · нагадування ввімкнено для ${formatNumber(activeCount)}`
          : "Завантаження…"
      }
      actions={<span className="chip">Нагадування про незаповнену відмітку</span>}
    >
      {teachers.error instanceof ApiError && (
        <div className="form-error">
          {teachers.error.message === "feature_not_available"
            ? "Функція сповіщень вчителям недоступна для поточного тарифу."
            : teachers.error.message}
        </div>
      )}

      <div className="metric-strip">
        <div><b>{formatNumber(list.length)}</b><span>активних вчителів</span></div>
        <div><b>{formatNumber(activeCount)}</b><span>з нагадуванням</span></div>
        <div><b>{formatNumber(telegramCount)}</b><span>Telegram підключено</span></div>
      </div>

      {teachers.isLoading && <EmptyState title="Завантажуємо сповіщення…" />}

      {!teachers.isLoading && list.length === 0 && !teachers.error && (
        <EmptyState title="Немає активних вчителів">Додайте активних вчителів, щоб налаштувати нагадування</EmptyState>
      )}

      {!teachers.isLoading && list.length > 0 && (
        <div className="tn-layout">
          <aside className="tn-list">
            <div className="tsearch tn-search">
              <IconSearch />
              <input placeholder="Пошук вчителя…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="tn-scroll">
              {filtered.length === 0 && <div className="empty-inline">Нічого не знайдено</div>}
              {filtered.map((t) => (
                <button
                  key={t.teacher_id}
                  type="button"
                  className={`tn-teacher${t.teacher_id === selectedId ? " active" : ""}`}
                  onClick={() => setSelectedId(t.teacher_id)}
                >
                  <span className={`tn-status-dot${reminderOn(t) ? " on" : t.has_telegram ? "" : " none"}`} />
                  <span className="tn-tinfo">
                    <b>{t.teacher_full_name}</b>
                    <span>{reminderOn(t) ? "Нагадування ввімкнено" : t.has_telegram ? "Вимкнено" : "Без Telegram"}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          {selected
            ? <TeacherReminderPanel key={selected.teacher_id} teacher={selected} />
            : <div className="tn-panel tn-empty"><EmptyState title="Оберіть вчителя">Виберіть вчителя зі списку, щоб налаштувати нагадування</EmptyState></div>}
        </div>
      )}
    </PageShell>
  );
}
