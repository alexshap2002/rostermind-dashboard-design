import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, getCurrentSession, login, loginSecondFactor } from "../../lib/api";
import { mainBranchQueries } from "../mainBranch/api";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Другий крок (super_admin з кодом із телефона): «виклик» від сервера на 5 хв.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  /** Кука сесії вже стоїть — ведемо туди, куди каже `/auth/me`. */
  async function enter() {
    await qc.invalidateQueries();
    const session = await getCurrentSession();
    if (session.redirect_url === "/") {
      // Власник мережі (≥2 активні філії) починає з «Усієї мережі», з однією філією — одразу в ній.
      const network = session.role === "owner"
        ? await qc.fetchQuery(mainBranchQueries.context()).catch(() => null)
        : null;
      const activeCount = network?.branches.filter((b) => b.lifecycle_status === "active").length ?? 0;
      navigate(activeCount >= 2 ? "/main-branch" : "/", { replace: true });
    } else {
      window.location.assign(session.redirect_url);
    }
  }

  function backToPassword() {
    setChallenge(null);
    setCode("");
    setBackupCode(false);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (challenge) {
        await loginSecondFactor(challenge, code.trim());
        await enter();
        return;
      }
      const result = await login(username.trim(), password);
      if ("recovery_required" in result) {
        sessionStorage.setItem("billing_recovery", JSON.stringify(result));
        navigate("/billing-recovery", { replace: true });
        return;
      }
      if ("second_factor_required" in result) {
        setPassword("");
        setChallenge(result.challenge);
        return;
      }
      await enter();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError("Декілька філій із цим логіном. Скористайтеся прямим посиланням філії.");
        } else {
          setError(err.message || "Неправильний логін або пароль");
        }
      } else {
        setError("Не вдалося з'єднатися із сервером");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <img className="brand-logo" src="/static/logo.png" alt="" />
          <div>
            <div className="lt">RosterMind</div>
            <div className="ls">Облік відвідуваності</div>
          </div>
        </div>

        <h1>{challenge ? "Код із застосунку" : "Вхід до панелі"}</h1>
        <p className="subtitle">
          {!challenge
            ? "Увійдіть, щоб керувати школою"
            : backupCode
              ? "Введіть один із резервних кодів — кожен спрацює лише раз"
              : "Введіть 6 цифр із застосунку на телефоні"}
        </p>

        {error && <div className="login-error">{error}</div>}

        {challenge ? (
          <>
            <div className="field">
              <label htmlFor="code">{backupCode ? "Резервний код" : "Код"}</label>
              <input
                id="code"
                key={backupCode ? "backup" : "app"}
                type="text"
                inputMode={backupCode ? "text" : "numeric"}
                autoComplete="one-time-code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={32}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={backupCode ? "xxxxx-xxxxx" : "123456"}
                autoFocus
                required
              />
            </div>

            <button className="btn login-btn" type="submit" disabled={busy}>
              {busy ? "Перевіряємо…" : "Увійти"}
            </button>
            <div className="login-alt">
              <button type="button" className="link" onClick={() => { setBackupCode(!backupCode); setCode(""); }}>
                {backupCode ? "Код із застосунку" : "Немає телефона? Резервний код"}
              </button>
              <button type="button" className="link" onClick={backToPassword}>Назад</button>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="username">Логін</label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="name@example.com"
                autoFocus
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Пароль</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button className="btn login-btn" type="submit" disabled={busy}>
              {busy ? "Входимо…" : "Увійти"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
