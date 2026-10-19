import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormModal, PageError, StatusTag } from "../../components/admin/primitives";
import { ApiError } from "../../lib/api";
import { formatNumber } from "../../lib/format";
import { platformApi, platformQueries } from "./api";
import { PlatformShell } from "./PlatformShell";

const errorText = (error: unknown) =>
  error instanceof ApiError ? error.message : "Не вдалося зберегти. Спробуйте ще раз.";

/** «Безпека»: код входу з телефона (TOTP) і власний пароль super_admin. */
export function SecurityPage() {
  const me = useQuery(platformQueries.me());
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <PlatformShell title="Безпека" subtitle={me.data ? `Вхід у кабінет: ${me.data.login}` : "Завантаження…"}>
      {notice && <div className="form-ok">{notice}</div>}
      {me.error && <PageError error={me.error} onRetry={() => me.refetch()} />}
      {me.data?.totp_bypassed && (
        <div className="form-warn">
          Аварійний режим: у env сервера SUPERADMIN_TOTP_DISABLED=true, і кабінет пускає без коду.
          {me.data.totp_enabled ? " Вимкніть код тут (код не потрібен), поверніть false, перезапустіть бекенд і ввімкніть код з новим телефоном." : " Поверніть false і перезапустіть бекенд."}
        </div>
      )}
      {me.data && (
        <div className="pf-detail">
          <TotpTile enabled={me.data.totp_enabled} bypassed={me.data.totp_bypassed} backupLeft={me.data.backup_codes_left} onNotice={setNotice} />
          <PasswordTile onNotice={setNotice} />
        </div>
      )}
    </PlatformShell>
  );
}

function TotpTile({
  enabled,
  bypassed,
  backupLeft,
  onNotice,
}: {
  enabled: boolean;
  bypassed: boolean;
  backupLeft: number;
  onNotice: (text: string) => void;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["platform"] });

  const setup = useMutation({ mutationFn: platformApi.totpSetup });
  const enable = useMutation({
    mutationFn: () => platformApi.totpEnable(code.trim()),
    onSuccess: (result) => {
      setBackupCodes(result.backup_codes);
      setCode("");
      setup.reset();
      refresh();
    },
  });

  // Вікна — поза гілками: коди лишаються на екрані й тоді, коли плитка вже показує «Увімкнено».
  const modals = (
    <>
      {backupCodes && <BackupCodesModal codes={backupCodes} onClose={() => setBackupCodes(null)} />}
      {disabling && (
        <DisableModal
          needCode={!bypassed}
          onClose={() => setDisabling(false)}
          onDone={() => {
            setDisabling(false);
            refresh();
            onNotice("Код входу вимкнено. Щоб увімкнути знову — відскануйте новий QR.");
          }}
        />
      )}
    </>
  );

  if (enabled) {
    return (
      <section className="tile">
        <div className="tile-head"><h3>Код входу з телефона</h3><StatusTag tone="create">Увімкнено</StatusTag></div>
        <p className="pf-text">Після пароля кабінет просить 6 цифр із застосунку. Без телефона пароль сам по собі нічого не відкриє.</p>
        <div className="pf-lines">
          <div>
            <span>Резервні коди</span>
            <b className={backupLeft <= 3 ? "pf-soon" : ""}>
              лишилось {formatNumber(backupLeft)} з 10{backupLeft <= 3 ? " — увімкніть код наново, щоб отримати нові" : ""}
            </b>
          </div>
        </div>
        <div className="pf-actions">
          <button type="button" className="btn ghost keep-label" onClick={() => setDisabling(true)}>Вимкнути код</button>
        </div>
        {modals}
      </section>
    );
  }

  return (
    <section className="tile">
      <div className="tile-head"><h3>Код входу з телефона</h3><StatusTag tone="enroll">Вимкнено</StatusTag></div>
      {!setup.data ? (
        <>
          <p className="pf-text">
            Після пароля кабінет попросить 6 цифр із застосунку на телефоні — Google Authenticator, Microsoft Authenticator
            чи 1Password. Тоді вкраденого пароля буде замало, щоб відкрити всі заклади.
          </p>
          {setup.error && <div className="form-error">{errorText(setup.error)}</div>}
          <div className="pf-actions">
            <button type="button" className="btn keep-label" disabled={setup.isPending} onClick={() => setup.mutate()}>
              {setup.isPending ? "Готуємо…" : "Увімкнути код"}
            </button>
          </div>
        </>
      ) : (
        <form
          className="pf-totp"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            enable.mutate();
          }}
        >
          <p className="pf-text">1. Відкрийте застосунок і відскануйте QR-код.</p>
          <img className="pf-qr" src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.data.qr_svg)}`} alt="QR-код для застосунку" />
          <p className="pf-text">
            Не сканується? Введіть ключ вручну: <b className="pf-secret pf-key">{setup.data.secret.match(/.{1,4}/g)?.join(" ")}</b>
          </p>
          <div className="field">
            <label htmlFor="pf-totp-code">2. Код із застосунку</label>
            <input
              id="pf-totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              required
            />
          </div>
          {enable.error && <div className="form-error">{errorText(enable.error)}</div>}
          <div className="pf-actions">
            <button type="submit" className="btn keep-label" disabled={enable.isPending || code.trim().length < 6}>
              {enable.isPending ? "Перевіряємо…" : "Підтвердити й увімкнути"}
            </button>
            <button type="button" className="btn ghost keep-label" onClick={() => { setup.reset(); setCode(""); }}>Скасувати</button>
          </div>
        </form>
      )}
      {modals}
    </section>
  );
}

/** Резервні коди показуються один раз — одразу після ввімкнення. */
function BackupCodesModal({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const text = ["Резервні коди входу RosterMind (кожен — один раз):", ...codes].join("\n");
  return (
    <FormModal title="Код входу ввімкнено" submitLabel="" submitVisible={false} cancelLabel="Я зберіг коди" onClose={onClose} onSubmit={(e: FormEvent) => e.preventDefault()}>
      <div className="form-warn">
        Збережіть ці коди поза телефоном (менеджер паролів чи папір). Кожен спрацює один раз, якщо телефона не буде під рукою.
        Більше вони не покажуться.
      </div>
      <ol className="pf-codes">
        {codes.map((code) => <li key={code}>{code}</li>)}
      </ol>
      <div className="pf-actions">
        <button
          type="button"
          className="btn keep-label"
          onClick={() => {
            const copying = navigator.clipboard?.writeText(text);
            if (copying) copying.then(() => setCopied(true), () => setCopied(false));
            else setCopied(false);
          }}
        >
          Скопіювати коди
        </button>
      </div>
      {copied === true && <div className="form-ok">Скопійовано.</div>}
      {copied === false && <pre className="br-copy-fallback">{text}</pre>}
    </FormModal>
  );
}

function DisableModal({ needCode, onClose, onDone }: { needCode: boolean; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const disable = useMutation({ mutationFn: () => platformApi.totpDisable(code.trim()), onSuccess: onDone });
  return (
    <FormModal
      title="Вимкнути код входу?"
      submitLabel="Вимкнути"
      pending={disable.isPending}
      submitDisabled={needCode && code.trim().length < 6}
      error={disable.error ? errorText(disable.error) : null}
      onClose={onClose}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        disable.mutate();
      }}
    >
      <p className="pf-text">
        Після цього в кабінет можна буде увійти самим паролем.
        {needCode ? " Підтвердіть кодом із застосунку або резервним кодом." : " Аварійний режим: код не потрібен."}
      </p>
      {needCode && (
        <div className="field">
          <label htmlFor="pf-disable-code">Код</label>
          <input id="pf-disable-code" autoComplete="one-time-code" autoCapitalize="none" maxLength={32} value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
        </div>
      )}
    </FormModal>
  );
}

function PasswordTile({ onNotice }: { onNotice: (text: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const change = useMutation({
    mutationFn: () => platformApi.changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setRepeat("");
      onNotice("Пароль змінено. Наступний вхід — з новим паролем.");
    },
  });
  const mismatch = repeat.length > 0 && next !== repeat;

  return (
    <section className="tile">
      <div className="tile-head"><h3>Мій пароль</h3></div>
      <form
        className="pf-totp"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <div className="field">
          <label htmlFor="pf-pass-current">Поточний пароль</label>
          <input id="pf-pass-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="pf-pass-new">Новий пароль</label>
          <input id="pf-pass-new" type="password" autoComplete="new-password" minLength={12} value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="pf-pass-repeat">Новий пароль ще раз</label>
          <input id="pf-pass-repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        </div>
        <p className="cell-sub">Щонайменше 12 символів. Найкраще — довга фраза з менеджера паролів.</p>
        {mismatch && <div className="form-error">Паролі не збігаються</div>}
        {change.error && <div className="form-error">{errorText(change.error)}</div>}
        <div className="pf-actions">
          <button type="submit" className="btn keep-label" disabled={change.isPending || !current || next.length < 12 || next !== repeat}>
            {change.isPending ? "Змінюємо…" : "Змінити пароль"}
          </button>
        </div>
      </form>
    </section>
  );
}
