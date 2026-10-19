import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormModal } from "../../components/admin/primitives";
import { ApiError } from "../../lib/api";
import { todayIso } from "../../lib/billing";
import { formatNumber, pluralUk } from "../../lib/format";
import { platformApi, platformQueries, type AddedTenant, type CreatedTenant, type PlatformOwner, type PlatformTenant } from "./api";
import { addMonthsIso, networkTerms, termsText } from "./schools";

type OwnerMode = "new" | "existing";

const errorText = (error: unknown) =>
  error instanceof ApiError ? error.message : "Не вдалося створити. Спробуйте ще раз.";
const schoolsCount = (n: number) => `${formatNumber(n)} ${pluralUk(n, "заклад", "заклади", "закладів")}`;

/** Текст для школи: адреса входу, логін і тимчасовий пароль. */
function welcomeText(created: CreatedTenant): string {
  return [
    `Вітаємо в RosterMind! Заклад «${created.name}» готовий.`,
    `Адреса входу: ${window.location.origin}/login`,
    `Логін: ${created.login}`,
    `Пароль: ${created.password}`,
    "Після входу змініть пароль: «Користувачі» → ваш запис. Далі кнопка «Що далі?» підкаже наступні кроки.",
  ].join("\n");
}

/** Текст власникові мережі: новий заклад уже в його акаунті, пароль той самий. */
function addedText(added: AddedTenant): string {
  return [
    `Додали заклад «${added.name}» до вашого акаунта RosterMind.`,
    `Увійдіть як завжди (${window.location.origin}/login) — новий заклад у «Філії й оплата», кнопка «Відкрити філію».`,
  ].join("\n");
}

/** Останнє «оплачено до» серед платних філій власника — новий заклад зручно вирівняти з мережею. */
function networkPaidUntil(branches: PlatformTenant[]): string | null {
  const dates = branches.filter((t) => t.price_mode !== "free" && t.paid_until).map((t) => t.paid_until!).sort();
  const last = dates[dates.length - 1];
  return last && last >= todayIso() ? last : null;
}

/**
 * «Новий заклад» за хвилину: новому власнику (пароль генерується й показується один раз)
 * або наявному — заклад стає ще однією філією його мережі, вхід той самий.
 */
export function NewSchoolModal({ onClose, owner: presetOwner }: { onClose: () => void; owner?: PlatformOwner }) {
  const qc = useQueryClient();
  const tenants = useQuery(platformQueries.tenants());
  const [mode, setMode] = useState<OwnerMode>(presetOwner ? "existing" : "new");
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [ownerId, setOwnerId] = useState<number | "">(presetOwner?.account_id ?? "");
  const branchesOf = (accountId: number | "") => (tenants.data ?? []).filter((t) => t.owner?.account_id === accountId);
  const [paidUntil, setPaidUntil] = useState(() => networkPaidUntil(branchesOf(ownerId)) ?? addMonthsIso(todayIso(), 1));
  const [copied, setCopied] = useState<boolean | null>(null);

  // Власники з реєстру: по одному рядку на акаунт, заблоковані — в кінці й без вибору.
  const owners = useMemo(() => {
    const byId = new Map<number, PlatformOwner>();
    for (const t of tenants.data ?? []) if (t.owner && !t.is_demo) byId.set(t.owner.account_id, t.owner);
    return [...byId.values()].sort(
      (a, b) => Number(b.is_active) - Number(a.is_active) || (a.full_name || a.login).localeCompare(b.full_name || b.login, "uk"),
    );
  }, [tenants.data]);
  const owner = owners.find((o) => o.account_id === ownerId) ?? presetOwner;
  const ownerBranches = branchesOf(ownerId);
  const terms = networkTerms(ownerBranches);

  const done = () => qc.invalidateQueries({ queryKey: ["platform"] });
  const create = useMutation({
    mutationFn: () =>
      platformApi.createTenant({
        name,
        owner_login: login,
        paid_until: paidUntil,
        owner_full_name: fullName.trim() || null,
        owner_phone: phone.trim() || null,
      }),
    onSuccess: done,
  });
  const add = useMutation({
    mutationFn: () => platformApi.addTenantToOwner(Number(ownerId), { name, paid_until: paidUntil }),
    onSuccess: done,
  });
  const active = mode === "new" ? create : add;

  const copy = (text: string) => {
    const copying = navigator.clipboard?.writeText(text);
    if (copying) copying.then(() => setCopied(true), () => setCopied(false));
    else setCopied(false);
  };
  const copyBlock = (text: string, label: string) => (
    <>
      <div className="pf-actions">
        <button type="button" className="btn keep-label" onClick={() => copy(text)}>{label}</button>
      </div>
      {copied === true && <div className="form-ok">Скопійовано — вставте в чат зі школою.</div>}
      {copied === false && <pre className="br-copy-fallback">{text}</pre>}
    </>
  );

  if (create.data) {
    const created = create.data;
    return (
      <FormModal title="Заклад створено" submitLabel="" submitVisible={false} cancelLabel="Готово" onClose={onClose} onSubmit={(e: FormEvent) => e.preventDefault()}>
        <div className="form-warn">Пароль показується лише зараз. Скопіюйте повідомлення й надішліть власнику закладу.</div>
        <div className="pf-lines pf-created">
          <div><span>Заклад</span><b>{created.name}</b></div>
          <div><span>Логін</span><b>{created.login}</b></div>
          <div><span>Пароль</span><b className="pf-secret">{created.password}</b></div>
        </div>
        {copyBlock(welcomeText(created), "Скопіювати повідомлення")}
      </FormModal>
    );
  }

  if (add.data) {
    const added = add.data;
    return (
      <FormModal title="Заклад додано" submitLabel="" submitVisible={false} cancelLabel="Готово" onClose={onClose} onSubmit={(e: FormEvent) => e.preventDefault()}>
        <div className="form-ok">
          Заклад уже працює. Власник побачить його у «Філії й оплата» — новий пароль не потрібен.
        </div>
        <div className="pf-lines pf-created">
          <div><span>Заклад</span><b>{added.name}</b></div>
          <div><span>Власник</span><b>{added.owner_name} · {added.owner_login}</b></div>
          <div><span>Мережа</span><b>тепер {schoolsCount(added.branches)}</b></div>
          <div><span>Умови оплати</span><b>{termsText({ mode: added.price_mode, amount: added.price_amount_uah, reason: added.price_reason })}</b></div>
        </div>
        {copyBlock(addedText(added), "Скопіювати повідомлення власнику")}
      </FormModal>
    );
  }

  return (
    <FormModal
      title={mode === "new" ? "Новий заклад" : "Новий заклад наявному власнику"}
      submitLabel={mode === "new" ? "Створити" : "Додати заклад"}
      pending={active.isPending}
      submitDisabled={!name.trim() || !paidUntil || (mode === "new" ? !login.trim() : !ownerId || owner?.is_active === false)}
      error={active.error ? errorText(active.error) : null}
      onClose={onClose}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        active.mutate();
      }}
    >
      <div className="seg pf-seg" role="group" aria-label="Для кого заклад">
        <button type="button" className={mode === "new" ? "on" : ""} aria-pressed={mode === "new"} onClick={() => setMode("new")}>
          Новий власник
        </button>
        <button type="button" className={mode === "existing" ? "on" : ""} aria-pressed={mode === "existing"} onClick={() => setMode("existing")}>
          Наявний власник
        </button>
      </div>

      <div className="fgrid">
        {mode === "existing" && (
          <div className="field span-12">
            <label htmlFor="pf-new-owner">Власник *</label>
            <select
              id="pf-new-owner"
              value={ownerId}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : "";
                setOwnerId(id);
                setPaidUntil(networkPaidUntil(branchesOf(id)) ?? addMonthsIso(todayIso(), 1));
              }}
              required
            >
              <option value="">Оберіть власника</option>
              {owners.map((o) => (
                <option key={o.account_id} value={o.account_id} disabled={!o.is_active}>
                  {o.full_name || o.login} · {o.login} · {schoolsCount(o.branches)}{o.is_active ? "" : " · заблоковано"}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field span-12">
          <label htmlFor="pf-new-name">Назва закладу *</label>
          <input
            id="pf-new-name"
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            placeholder={mode === "new" ? "Наприклад: Центр «Сонечко»" : "Наприклад: Школа Життя · Київ"}
            required
          />
        </div>
        {mode === "new" && (
          <div className="field span-6">
            <label htmlFor="pf-new-login">Логін власника *</label>
            <input id="pf-new-login" value={login} maxLength={100} autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={(e) => setLogin(e.target.value)} placeholder="латиницею, напр. sonechko.admin" required />
          </div>
        )}
        <div className={`field ${mode === "new" ? "span-6" : "span-12"}`}>
          <label htmlFor="pf-new-paid">Оплачено до *</label>
          <input id="pf-new-paid" type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} required />
        </div>
        {mode === "new" && (
          <>
            <div className="field span-6">
              <label htmlFor="pf-new-fullname">Ім'я власника</label>
              <input id="pf-new-fullname" value={fullName} maxLength={200} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="field span-6">
              <label htmlFor="pf-new-phone">Телефон власника</label>
              <input id="pf-new-phone" type="tel" value={phone} maxLength={32} onChange={(e) => setPhone(e.target.value)} placeholder="+380…" />
            </div>
          </>
        )}
      </div>

      {mode === "new" ? (
        <p className="cell-sub">Пароль згенерується сам і покажеться один раз. Заклад одразу працює, з усіма можливостями, умови — за тарифом.</p>
      ) : (
        owner && (
          <ul className="pf-preview">
            <li>Мережа <b>{owner.full_name || owner.login}</b>: зараз {schoolsCount(ownerBranches.length)} → стане {schoolsCount(ownerBranches.length + 1)}</li>
            <li>Умови оплати — як у мережі: <b>{termsText(terms)}</b></li>
            <li>Вхід той самий: власник побачить новий заклад у «Філії й оплата».</li>
          </ul>
        )
      )}
    </FormModal>
  );
}
