import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormModal } from "../../components/admin/primitives";
import { ApiError } from "../../lib/api";
import { hrn, kids, tariffPrice } from "../../lib/billing";
import { platformApi, type PlatformTenant, type PriceMode } from "./api";

const REASONS = ["Партнер", "Тестовий заклад"];
const MAX_AMOUNT = 100_000;

const OPTIONS: { mode: PriceMode; title: string; hint: string }[] = [
  { mode: "tariff", title: "За тарифом", hint: "599 ₴ до 70 дітей у базі, 999 ₴ — понад 70" },
  { mode: "custom", title: "Своя сума", hint: "Фіксована ціна на місяць — хоч скільки дітей" },
  { mode: "free", title: "Безкоштовно", hint: "Партнер чи тестовий заклад — оплата не потрібна" },
];

const nowText = (t: PlatformTenant) => (t.price_mode === "free" ? "безкоштовно" : `${hrn(t.price_uah)}/міс.`);

/** «Умови оплати»: за тарифом, своя сума чи безкоштовно — для закладу або кількох філій мережі одним збереженням. */
export function PriceTermsModal({
  tenants,
  initialIds,
  onClose,
  onDone,
}: {
  /** Заклад або всі філії мережі. */
  tenants: PlatformTenant[];
  initialIds: number[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const qc = useQueryClient();
  const first = tenants.find((t) => t.tenant_id === initialIds[0]) ?? tenants[0];
  const [selected, setSelected] = useState<number[]>(initialIds);
  const [mode, setMode] = useState<PriceMode>(first.price_mode);
  const [amount, setAmount] = useState(first.price_mode === "custom" ? String(first.price_uah) : "");
  const [reason, setReason] = useState(first.price_mode === "tariff" ? "" : first.price_reason ?? "");
  const network = tenants.length > 1;
  const chosen = tenants.filter((t) => selected.includes(t.tenant_id));
  const sum = Number(amount);
  const amountOk = mode !== "custom" || (Number.isInteger(sum) && sum >= 1 && sum <= MAX_AMOUNT);
  const reasonOk = mode === "tariff" || reason.trim().length > 0;

  const save = useMutation({
    mutationFn: () => platformApi.setPriceTerms(selected, mode, mode === "custom" ? sum : null, mode === "tariff" ? "" : reason),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["platform"] });
      onDone(
        result.updated.length
          ? `Умови оплати змінено: ${chosen.filter((t) => result.updated.includes(t.tenant_id)).map((t) => t.name).join(", ")}`
          : "Умови й так були такими — нічого не змінилось",
      );
    },
  });

  const after = (t: PlatformTenant) => {
    if (mode === "free") return "безкоштовно";
    if (mode === "custom") return amountOk && amount ? `${hrn(sum)}/міс.` : "своя сума";
    return `${hrn(tariffPrice(t.students))}/міс. (${kids(t.students)})`;
  };
  const toggle = (id: number) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <FormModal
      title={network ? "Умови оплати мережі" : `Умови оплати · ${first.name}`}
      submitLabel="Зберегти умови"
      pending={save.isPending}
      submitDisabled={!selected.length || !amountOk || !reasonOk}
      error={save.error ? (save.error instanceof ApiError ? save.error.message : "Не вдалося зберегти. Спробуйте ще раз.") : null}
      onClose={onClose}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {network && (
        <div className="pf-pick">
          {tenants.map((t) => (
            <label key={t.tenant_id} className={`check${selected.includes(t.tenant_id) ? " on" : ""}`}>
              <input type="checkbox" checked={selected.includes(t.tenant_id)} onChange={() => toggle(t.tenant_id)} />
              {t.name}
            </label>
          ))}
        </div>
      )}

      <div className="pf-terms" role="radiogroup" aria-label="Умови оплати">
        {OPTIONS.map((option) => (
          <label key={option.mode} className={`check${mode === option.mode ? " on" : ""}`}>
            <input type="radio" name="pf-terms" checked={mode === option.mode} onChange={() => setMode(option.mode)} />
            <span>
              <b>{option.title}</b>
              <small>{option.hint}</small>
            </span>
          </label>
        ))}
      </div>

      <div className="fgrid">
        {mode === "custom" && (
          <div className="field span-12">
            <label htmlFor="pf-terms-amount">Сума на місяць, ₴ *</label>
            <input
              id="pf-terms-amount"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_AMOUNT}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Наприклад: 450"
              required
              autoFocus
            />
          </div>
        )}
        {mode !== "tariff" && (
          <div className="field span-12">
            <label htmlFor="pf-terms-reason">Причина *</label>
            <input id="pf-terms-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Чому так — для журналу" required />
            <div className="pf-presets">
              {REASONS.map((r) => (
                <button key={r} type="button" className="btn ghost keep-label" onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <ul className="pf-preview">
        {chosen.map((t) => (
          <li key={t.tenant_id}>
            <b>{t.name}</b>: {nowText(t)} → <b>{after(t)}</b>
          </li>
        ))}
      </ul>
      <p className="cell-sub">
        Цю ж ціну власник побачить у «Філії й оплата» та в Excel мережі. Причину бачите лише ви; у «Історії змін» школи буде тільки, що умови змінено.
      </p>
    </FormModal>
  );
}
