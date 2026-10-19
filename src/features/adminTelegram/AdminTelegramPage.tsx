import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DataTable, DataToolbar, EmptyState, PageShell, StatusTag,
} from "../../components/admin/primitives";
import { ApiError } from "../../lib/api";
import { formatNumber } from "../../lib/format";
import { IconBell, IconSend } from "../../lib/icons";
import {
  adminTelegramApi, adminTelegramQueries,
  type TelegramNotificationPayload,
  type TelegramNotificationSetting,
} from "./api";

const DAYS = [
  { value: 0, label: "Пн" },
  { value: 1, label: "Вт" },
  { value: 2, label: "Ср" },
  { value: 3, label: "Чт" },
  { value: 4, label: "Пт" },
  { value: 5, label: "Сб" },
  { value: 6, label: "Нд" },
];

type DraftState = Record<string, TelegramNotificationPayload>;

function toDraft(notifications: Record<string, TelegramNotificationSetting>): DraftState {
  const draft: DraftState = {};
  for (const [type, setting] of Object.entries(notifications)) {
    draft[type] = {
      enabled: setting.enabled,
      trigger_time: setting.trigger_time ? setting.trigger_time.slice(0, 5) : null,
      trigger_day: setting.trigger_day,
      trigger_days: setting.trigger_days ?? [],
      config: { ...setting.config },
    };
  }
  return draft;
}

function timeForApi(value?: string | null) {
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value;
}

// schedule_days дублює колонку «Дні» (той самий вибір днів, який бекенд
// перевираховує з trigger_days), last_* — внутрішні курсори. Не показуємо.
function isEditableConfigKey(key: string) {
  return key !== "schedule_days" && !key.startsWith("last_");
}

function configLabel(key: string) {
  switch (key) {
    case "threshold_percent": return "Поріг, %";
    case "lookback_days": return "Період, днів";
    case "min_lessons": return "Мін. уроків";
    case "consecutive_limit": return "Кількість поспіль";
    case "hours_after_start": return "Годин після старту";
    default: return key;
  }
}

export function AdminTelegramPage() {
  const qc = useQueryClient();
  const settings = useQuery(adminTelegramQueries.settings());
  const [chatId, setChatId] = useState("");
  const [draft, setDraft] = useState<DraftState>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setChatId(settings.data.chat_id ? String(settings.data.chat_id) : "");
    setDraft(toDraft(settings.data.notifications));
  }, [settings.data]);

  const rows = useMemo(
    () => Object.values(settings.data?.notifications ?? {}),
    [settings.data?.notifications],
  );
  const enabledCount = Object.values(draft).filter((item) => item.enabled).length;

  const save = useMutation({
    mutationFn: () => {
      const notifications: Record<string, TelegramNotificationPayload> = {};
      for (const [type, item] of Object.entries(draft)) {
        notifications[type] = {
          enabled: item.enabled,
          trigger_time: timeForApi(item.trigger_time),
          trigger_day: item.trigger_day ?? null,
          trigger_days: item.trigger_days ?? [],
          config: item.config ?? {},
        };
      }
      return adminTelegramApi.update({
        chat_id: chatId ? Number(chatId) : null,
        notifications,
      });
    },
    onSuccess: (res) => {
      qc.setQueryData(["admin-telegram", "settings"], res);
      qc.invalidateQueries({ queryKey: ["admin-telegram"] });
      setMessage("Налаштування збережено");
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Не вдалося зберегти налаштування"),
  });
  const test = useMutation({
    mutationFn: (type?: string) => adminTelegramApi.test({
      chat_id: chatId ? Number(chatId) : null,
      notification_type: type ?? null,
    }),
    onSuccess: (res) => setMessage(res.message),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Не вдалося надіслати тест"),
  });

  function patch(type: string, value: Partial<TelegramNotificationPayload>) {
    setDraft((prev) => ({
      ...prev,
      [type]: { ...prev[type], ...value },
    }));
  }

  function patchConfig(type: string, key: string, raw: string) {
    setDraft((prev) => {
      const current = prev[type];
      const parsed = raw === "" ? "" : Number(raw);
      return {
        ...prev,
        [type]: {
          ...current,
          config: { ...current.config, [key]: Number.isNaN(parsed) ? raw : parsed },
        },
      };
    });
  }

  function toggleDay(type: string, day: number) {
    const current = draft[type]?.trigger_days ?? [];
    patch(type, {
      trigger_days: current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
      trigger_day: current.includes(day) ? current.filter((d) => d !== day)[0] ?? null : [...current, day].sort()[0],
    });
  }

  return (
    <PageShell
      title="Сповіщення адміністратору"
      subtitle={
        settings.data
          ? `${formatNumber(rows.length)} типів сповіщень · активних ${formatNumber(enabledCount)}`
          : "Завантаження…"
      }
      actions={<button className="btn" disabled={save.isPending} onClick={() => { setError(null); setMessage(null); save.mutate(); }}><IconBell />Зберегти</button>}
    >
      {settings.error instanceof ApiError && (
        <div className="form-error">
          {settings.error.message === "feature_not_available"
            ? "Функція Telegram-сповіщень адміністратору недоступна для поточного тарифу."
            : settings.error.message}
        </div>
      )}
      {error && (
        <div className="form-error" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{error}</span>
          <button className="link" onClick={() => setError(null)}>Закрити</button>
        </div>
      )}
      {message && (
        <div className="form-ok" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{message}</span>
          <button className="link" onClick={() => setMessage(null)}>Закрити</button>
        </div>
      )}
      <DataToolbar>
        <div className="field" style={{ marginBottom: 0, minWidth: 240 }}>
          <input
            aria-label="Telegram chat ID"
            type="number"
            placeholder="Telegram chat ID"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
          />
        </div>
        <button className="btn ghost" disabled={test.isPending || !chatId} onClick={() => test.mutate(undefined)}>
          <IconSend />Тест каналу
        </button>
        <span className="spacer" />
        <span className="chip">Часовий пояс: {settings.data?.timezone ?? "Europe/Kyiv"}</span>
      </DataToolbar>

      <div className="metric-strip">
        <div><b>{formatNumber(enabledCount)}</b><span>активні</span></div>
        <div><b>{formatNumber(rows.length - enabledCount)}</b><span>вимкнені</span></div>
        <div><b>{chatId || "—"}</b><span>chat ID</span></div>
      </div>

      {settings.isLoading && <EmptyState title="Завантажуємо налаштування…" />}
      {!settings.isLoading && rows.length === 0 && !settings.error && (
        <EmptyState title="Немає доступних сповіщень" />
      )}
      {rows.length > 0 && (
        <DataTable>
          <thead>
            <tr>
              <th>Сповіщення</th>
              <th>Статус</th>
              <th>Час</th>
              <th>Дні</th>
              <th>Параметри</th>
              <th style={{ textAlign: "right" }}>Тест</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const item = draft[row.type];
              return (
                <tr key={row.type}>
                  <td>
                    <div className="cell-name">{row.name}</div>
                    <div className="cell-sub">{row.description}</div>
                  </td>
                  <td>
                    <label className={`check${item?.enabled ? " on" : ""}`} style={{ display: "inline-flex" }}>
                      <input
                        type="checkbox"
                        checked={!!item?.enabled}
                        onChange={() => patch(row.type, { enabled: !item?.enabled })}
                      />
                      {item?.enabled ? "Увімкнено" : "Вимкнено"}
                    </label>
                  </td>
                  <td>
                    {row.requires_time ? (
                      <input
                        className="tselect"
                        type="time"
                        value={String(item?.trigger_time ?? row.trigger_time ?? "09:00").slice(0, 5)}
                        onChange={(e) => patch(row.type, { trigger_time: e.target.value })}
                      />
                    ) : (
                      <StatusTag tone="neutral">миттєво</StatusTag>
                    )}
                  </td>
                  <td>
                    {row.supports_day_selection ? (
                      <div className="days-row">
                        {DAYS.map((day) => (
                          <button
                            type="button"
                            key={day.value}
                            className={(item?.trigger_days ?? []).includes(day.value) ? "on" : ""}
                            onClick={() => toggleDay(row.type, day.value)}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    ) : row.requires_day ? (
                      <select
                        className="tselect"
                        value={item?.trigger_day ?? row.trigger_day ?? 0}
                        onChange={(e) => patch(row.type, { trigger_day: Number(e.target.value), trigger_days: [Number(e.target.value)] })}
                      >
                        {DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                      </select>
                    ) : (
                      <span className="cell-muted">—</span>
                    )}
                  </td>
                  <td>
                    {Object.keys(item?.config ?? {}).filter(isEditableConfigKey).length ? (
                      <div className="config-grid">
                        {Object.entries(item?.config ?? {})
                          .filter(([key]) => isEditableConfigKey(key))
                          .map(([key, value]) => (
                            <label key={key}>
                              <span>{configLabel(key)}</span>
                              <input type="number" value={String(value ?? "")} onChange={(e) => patchConfig(row.type, key, e.target.value)} />
                            </label>
                          ))}
                      </div>
                    ) : (
                      <span className="cell-muted">стандартно</span>
                    )}
                  </td>
                  <td>
                    <span className="row-actions">
                      <button type="button" className="row-btn" title="Надіслати тест" disabled={test.isPending || !chatId} onClick={() => test.mutate(row.type)}>
                        <IconSend />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </PageShell>
  );
}
