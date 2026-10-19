import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { IconClose } from "../../lib/icons";
import { teachersApi } from "./api";
import type { Teacher, TeacherInput } from "./types";

interface Props {
  teacher: Teacher | null; // null = створення
  onClose: () => void;
}

export function TeacherFormModal({ teacher, onClose }: Props) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(teacher?.full_name ?? "");
  const [birthDate, setBirthDate] = useState(teacher?.birth_date ?? "");
  const [tgChatId, setTgChatId] = useState(
    teacher?.tg_chat_id != null ? String(teacher.tg_chat_id) : "",
  );
  const [active, setActive] = useState(teacher?.active ?? true);
  // Лише при створенні — як у legacy: одразу завести тариф
  const [createPayRate, setCreatePayRate] = useState(true);
  const [payRateAmount, setPayRateAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload: TeacherInput = {
        full_name: fullName.trim(),
        birth_date: birthDate.trim() === "" ? null : birthDate,
        tg_chat_id: tgChatId.trim() === "" ? null : Number(tgChatId),
        active,
      };
      if (teacher) return teachersApi.update(teacher.id, payload);
      payload.create_pay_rate = createPayRate;
      payload.pay_rate_amount =
        createPayRate && payRateAmount.trim() !== "" ? Number(payRateAmount) : null;
      return teachersApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teachers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Не вдалося зберегти. Спробуйте ще раз.");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError("ПІБ — обов'язкове поле");
      return;
    }
    if (tgChatId.trim() !== "" && !/^-?\d+$/.test(tgChatId.trim())) {
      setError("Telegram Chat ID має бути числом");
      return;
    }
    save.mutate();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card narrow" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="modal-head">
          <h3>{teacher ? "Редагувати вчителя" : "Додати вчителя"}</h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="fgrid">
            <div className="field span-12">
              <label htmlFor="t-name">ПІБ *</label>
              <input
                id="t-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Шевченко Ірина Петрівна"
                required
                autoFocus
              />
            </div>
            <div className="field span-6">
              <label htmlFor="t-birth">День народження</label>
              <input id="t-birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
            <div className="field span-6">
              <label htmlFor="t-tg">Telegram Chat ID</label>
              <input
                id="t-tg"
                inputMode="numeric"
                value={tgChatId}
                onChange={(e) => setTgChatId(e.target.value)}
                placeholder="напр. 123456789"
              />
              <span className="cell-sub" style={{ marginTop: 4 }}>
                Технічний ідентифікатор Telegram — з'являється автоматично, коли вчитель
                підключиться через бота.
              </span>
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
                  <b>{active ? "Активний вчитель" : "Неактивний вчитель"}</b>
                  <span>Отримує сповіщення й нагадування, видимий у розкладі</span>
                </span>
              </button>
            </div>
          </div>

          {!teacher && (
            <>
              <div className="fsection">Тариф оплати</div>
              <div className="fgrid">
                <div className="field span-12">
                  <button
                    type="button"
                    className={`bigtoggle${createPayRate ? " on" : ""}`}
                    onClick={() => setCreatePayRate((v) => !v)}
                    aria-pressed={createPayRate}
                  >
                    <span className="sw" />
                    <span className="bigtoggle-txt">
                      <b>{createPayRate ? "Створити тариф одразу" : "Без тарифу"}</b>
                      <span>
                        {createPayRate
                          ? "Задайте ставку за урок нижче"
                          : "Тариф можна додати пізніше в розділі «Тарифи»"}
                      </span>
                    </span>
                  </button>
                </div>
                {createPayRate && (
                  <div className="field span-6">
                    <label htmlFor="t-rate">Ставка за урок, грн</label>
                    <input
                      id="t-rate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={payRateAmount}
                      onChange={(e) => setPayRateAmount(e.target.value)}
                      placeholder="за замовчуванням"
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className="btn" disabled={save.isPending}>
            {save.isPending ? "Зберігаємо…" : teacher ? "Зберегти зміни" : "Додати вчителя"}
          </button>
        </div>
      </form>
    </div>
  );
}
