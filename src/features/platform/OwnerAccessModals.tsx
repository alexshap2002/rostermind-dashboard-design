import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormModal } from "../../components/admin/primitives";
import { ApiError } from "../../lib/api";
import { formatNumber, pluralUk } from "../../lib/format";
import { platformApi, platformQueries, type OwnerTempPassword, type PlatformOwner } from "./api";

const errorText = (error: unknown) =>
  error instanceof ApiError ? error.message : "Не вдалося зберегти. Спробуйте ще раз.";
const schoolsCount = (n: number) => `${formatNumber(n)} ${pluralUk(n, "закладі", "закладах", "закладах")}`;

function passwordText(result: OwnerTempPassword): string {
  return [
    "Новий пароль для входу в RosterMind.",
    `Адреса входу: ${window.location.origin}/login`,
    `Логін: ${result.login}`,
    `Пароль: ${result.password}`,
    "Після входу змініть пароль: «Користувачі» → ваш запис.",
  ].join("\n");
}

/** Тимчасовий пароль власника школи: лише з увімкненим кодом входу і свіжим кодом; показується один раз. */
export function TempPasswordModal({ owner, onClose }: { owner: PlatformOwner; onClose: () => void }) {
  const qc = useQueryClient();
  const me = useQuery(platformQueries.me());
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState<boolean | null>(null);
  const reset = useMutation({
    mutationFn: () => platformApi.resetOwnerPassword(owner.account_id, code.trim()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform", "activity"] }),
  });

  if (reset.data) {
    const result = reset.data;
    const text = passwordText(result);
    return (
      <FormModal title="Тимчасовий пароль" submitLabel="" submitVisible={false} cancelLabel="Готово" onClose={onClose} onSubmit={(e: FormEvent) => e.preventDefault()}>
        <div className="form-warn">Пароль показується лише зараз. Скопіюйте повідомлення й надішліть власнику.</div>
        <div className="pf-lines pf-created">
          <div><span>Власник</span><b>{result.full_name} · {result.login}</b></div>
          <div><span>Пароль</span><b className="pf-secret">{result.password}</b></div>
          <div><span>Діє</span><b>у {schoolsCount(result.branches)} власника</b></div>
        </div>
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
            Скопіювати повідомлення
          </button>
        </div>
        {copied === true && <div className="form-ok">Скопійовано — вставте в чат із власником.</div>}
        {copied === false && <pre className="br-copy-fallback">{text}</pre>}
      </FormModal>
    );
  }

  const noCode = me.data && !me.data.totp_enabled;
  return (
    <FormModal
      title={`Тимчасовий пароль · ${owner.full_name || owner.login}`}
      submitLabel="Видати пароль"
      submitVisible={!noCode}
      pending={reset.isPending}
      submitDisabled={code.trim().length < 6}
      error={reset.error ? errorText(reset.error) : null}
      onClose={onClose}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        reset.mutate();
      }}
    >
      {noCode ? (
        <div className="form-warn">
          Дії з доступами шкіл — лише з кодом входу з телефона. Увімкніть його в <Link to="/platform/security">«Безпеці»</Link>.
        </div>
      ) : (
        <>
          <ul className="pf-preview">
            <li>Логін <b>{owner.login}</b> лишається, пароль зміниться в усіх його закладах ({formatNumber(owner.branches)}).</li>
            <li>Старий пароль перестане діяти одразу. Уже відкриті сесії власника доживуть до кінця — це не блокування.</li>
          </ul>
          <div className="field">
            <label htmlFor="pf-owner-code">Код із застосунку</label>
            <input id="pf-owner-code" autoComplete="one-time-code" autoCapitalize="none" maxLength={32} value={code}
              onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus required />
          </div>
        </>
      )}
    </FormModal>
  );
}

/** Ім'я й телефон власника школи — ім'я зміниться в усіх його закладах. */
export function OwnerContactsModal({ owner, onClose, onDone }: { owner: PlatformOwner; onClose: () => void; onDone: (message: string) => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(owner.full_name);
  const [phone, setPhone] = useState(owner.phone ?? "");
  const save = useMutation({
    mutationFn: () => platformApi.updateOwnerContacts(owner.account_id, fullName, phone),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["platform"] });
      onDone(result.changed ? `Контакти власника збережено: ${result.full_name}` : "Нічого не змінилось");
    },
  });
  return (
    <FormModal
      title="Ім'я й телефон власника"
      submitLabel="Зберегти"
      pending={save.isPending}
      submitDisabled={fullName.trim().length < 2}
      error={save.error ? errorText(save.error) : null}
      onClose={onClose}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="fgrid">
        <div className="field span-12">
          <label htmlFor="pf-owner-name">Ім'я *</label>
          <input id="pf-owner-name" value={fullName} maxLength={200} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="field span-12">
          <label htmlFor="pf-owner-phone">Телефон</label>
          <input id="pf-owner-phone" type="tel" value={phone} maxLength={32} onChange={(e) => setPhone(e.target.value)} placeholder="+380…" />
        </div>
      </div>
      <p className="cell-sub">Логін не змінюється. Ім'я власник побачить у всіх своїх закладах; зміну видно в їхній «Історії змін».</p>
    </FormModal>
  );
}
