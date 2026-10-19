import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { formatUpdatedAt } from "../../lib/format";
import { PageShell, StatusTag } from "../../components/admin/primitives";
import {
  myNotificationQueries, myNotificationsApi,
  type TeacherNotificationPayload,
} from "./api";

function clampDelay(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Власні налаштування нагадувань — сторінка вчителя, не адміністратора. */
export function MyNotificationsPage() {
  const qc = useQueryClient();
  const settings = useQuery(myNotificationQueries.settings());

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

  const data = settings.data;
  const hasTelegram = Boolean(data?.has_telegram);
  const disabled = !hasTelegram;

  const save = useMutation({
    mutationFn: () => {
      // Нагадування про наступний урок цим екраном не керуються — передаємо
      // наявні значення без змін, щоб не зачепити приховану частину налаштувань.
      const payload: TeacherNotificationPayload = {
        next_lesson_mode: data?.next_lesson_mode ?? "off",
        next_lesson_offset_minutes: data?.next_lesson_offset_minutes ?? 120,
        next_lesson_daily_digest_time: data?.next_lesson_daily_digest_time ?? "08:00:00",
        next_lesson_include_students: data?.next_lesson_include_students ?? false,
        unmarked_first_enabled: firstEnabled,
        unmarked_first_delay_minutes: clampDelay(firstDelay),
        unmarked_second_enabled: secondEnabled,
        unmarked_second_delay_minutes: clampDelay(secondDelay),
      };
      return myNotificationsApi.update(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teacher-notifications"] });
      setOk("Налаштування збережено");
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Не вдалося зберегти налаштування"),
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
    <PageShell
      title="Мої сповіщення"
      subtitle="Коли бот нагадує вам відмітити присутність"
    >
      <div className="tn-panel">
        <header className="tn-phead">
          <div className="tn-pname">
            <div>
              <b>{data?.teacher_full_name ?? "—"}</b>
              <span className="tn-pmeta">
                Оновлено {data?.updated_at ? formatUpdatedAt(data.updated_at) : "—"}
              </span>
            </div>
          </div>
          {data && (
            <StatusTag tone={hasTelegram ? "create" : "neutral"}>{data.telegram_status}</StatusTag>
          )}
        </header>

        {data && !hasTelegram && (
          <div className="tn-notice">
            Ваш Telegram не підключений. Нагадування надсилаються лише в Telegram — попросіть
            адміністратора надіслати вам посилання для підключення.
          </div>
        )}

        <p className="tn-lead">
          Якщо ви не відмітили присутність після початку уроку, бот нагадає про це в Telegram.
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
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
