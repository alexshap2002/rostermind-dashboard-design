import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  requestBillingRecoveryCheckout,
  type BillingRecoveryState,
} from "../../lib/api";
import { openLiqpayCheckout, SUB_STATUS } from "../branches/api";
import "./BillingRecoveryPage.css";

function readRecoveryState(): BillingRecoveryState | null {
  try {
    const raw = sessionStorage.getItem("billing_recovery");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BillingRecoveryState;
    if (!parsed.recovery_required || !parsed.challenge_token || !Array.isArray(parsed.branches)) return null;
    if (new Date(parsed.expires_at).getTime() <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function BillingRecoveryPage() {
  const state = useMemo(readRecoveryState, []);
  const [busyTenantId, setBusyTenantId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function continuePayment(tenantId: number) {
    if (!state) return;
    setBusyTenantId(tenantId);
    setError(null);
    try {
      const result = await requestBillingRecoveryCheckout(state.challenge_token, tenantId);
      sessionStorage.removeItem("billing_recovery");
      openLiqpayCheckout(result.checkout);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося підготувати оплату");
      setBusyTenantId(null);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card billing-recovery-card">
        <div className="login-brand">
          <img className="brand-logo" src="/static/logo.png" alt="" />
          <div><div className="lt">RosterMind</div><div className="ls">Відновлення доступу</div></div>
        </div>
        <h1>Потрібна оплата</h1>
        <p className="subtitle">
          Робочі дані залишаються закритими. Виберіть філію, щоб відновити її підписку через LiqPay.
        </p>
        {error && <div className="login-error">{error}</div>}
        {!state ? (
          <div className="login-error">Посилання відновлення відсутнє або прострочене. Увійдіть ще раз.</div>
        ) : (
          <div className="billing-recovery-list">
            {state.branches.map((branch) => (
              <div className="billing-recovery-row" key={branch.tenant_id}>
                <div>
                  <b>{branch.tenant_name}</b>
                  <span>{SUB_STATUS[branch.subscription_status]?.label ?? branch.subscription_status}</span>
                </div>
                <button
                  className="btn"
                  type="button"
                  disabled={busyTenantId !== null}
                  onClick={() => continuePayment(branch.tenant_id)}
                >
                  {busyTenantId === branch.tenant_id ? "Готуємо…" : "Перейти до оплати"}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="login-hint"><Link to="/login">Повернутися до входу</Link></div>
      </div>
    </div>
  );
}
