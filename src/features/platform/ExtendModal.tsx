import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormModal } from "../../components/admin/primitives";
import { ApiError } from "../../lib/api";
import { formatDateUk } from "../../lib/format";
import { platformApi, type PlatformTenant } from "./api";
import { addMonthsIso, extendBase } from "./schools";

/** «Продовжити оплату»: один заклад або кілька філій мережі — одна дата, одна транзакція. */
export function ExtendModal({
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
  const [selected, setSelected] = useState<number[]>(initialIds);
  const chosen = tenants.filter((t) => selected.includes(t.tenant_id));
  const base = extendBase(chosen.length ? chosen : tenants);
  const [paidUntil, setPaidUntil] = useState(addMonthsIso(base, 1));
  const [reason, setReason] = useState("");
  const network = tenants.length > 1;

  const save = useMutation({
    mutationFn: () => platformApi.extend(selected, paidUntil, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform"] });
      onDone(`Оплачено до ${formatDateUk(paidUntil)}: ${chosen.map((t) => t.name).join(", ")}`);
    },
  });

  const shortens = chosen.some((t) => t.paid_until && paidUntil < t.paid_until);
  const toggle = (id: number) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <FormModal
      title={network ? "Продовжити оплату мережі" : `Продовжити оплату · ${tenants[0]?.name ?? ""}`}
      submitLabel="Продовжити"
      pending={save.isPending}
      submitDisabled={!selected.length || !paidUntil}
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

      <div className="fgrid">
        <div className="field span-12">
          <label htmlFor="pf-paid-until">Оплачено до (включно)</label>
          <input id="pf-paid-until" type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} required />
          <div className="pf-presets">
            {[1, 3, 12].map((months) => (
              <button key={months} type="button" className="btn ghost keep-label" onClick={() => setPaidUntil(addMonthsIso(base, months))}>
                +{months} міс.
              </button>
            ))}
          </div>
        </div>
        <div className="field span-12">
          <label htmlFor="pf-reason">Коментар (необов'язково)</label>
          <input id="pf-reason" value={reason} maxLength={200} placeholder="Наприклад: оплата за листопад, переказ" onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>

      <ul className="pf-preview">
        {chosen.map((t) => (
          <li key={t.tenant_id}>
            <b>{t.name}</b>: {t.paid_until ? formatDateUk(t.paid_until) : "не оплачено"} → <b>{paidUntil ? formatDateUk(paidUntil) : "—"}</b>
          </li>
        ))}
      </ul>
      {shortens && <div className="form-warn">Нова дата раніша за поточну — оплачений період скоротиться.</div>}
    </FormModal>
  );
}
