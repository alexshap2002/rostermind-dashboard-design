import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { formatDateTimeUk } from "../../lib/format";
import { IconBars, IconClose, IconDownload, IconPencil, IconPlus } from "../../lib/icons";
import { useModalAccessibility } from "../../components/admin/useModalAccessibility";
import {
  ConfirmDialog, DataTable, EmptyState, FormModal, PageShell, StatusTag,
} from "../../components/admin/primitives";
import { dashboardQueries } from "../dashboard/api";
import {
  aiAccessApi, aiAccessLinks, aiAccessQueries,
  type AccessMode, type AiChange, type McpToken, type McpTokenCreated,
} from "./api";

const IconCopy = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
);

const TERMS = [
  { value: "", label: "Безстроково" },
  { value: "30", label: "30 днів" },
  { value: "90", label: "90 днів" },
  { value: "365", label: "Рік" },
];

const STATUS: Record<McpToken["status"], { tone: "create" | "enroll" | "delete"; label: string }> = {
  active: { tone: "create", label: "Активний" },
  expired: { tone: "enroll", label: "Протермінований" },
  revoked: { tone: "delete", label: "Відкликаний" },
};

const MODES: { value: AccessMode; title: string; sub: string; icon: ReactNode }[] = [
  { value: "read", title: "Лише читання", sub: "Звіти й відповіді на питання — змінити нічого не може", icon: <IconBars /> },
  { value: "write", title: "Читання й зміни", sub: "Учні, групи, розклад, вчителі, ставки й зарплати, відмітки", icon: <IconPencil /> },
];

const CHANGE_STATUS: Record<AiChange["status"], { tone: "create" | "delete" | "neutral"; label: string }> = {
  applied: { tone: "create", label: "Застосовано" },
  failed: { tone: "delete", label: "Не застосовано" },
  pending: { tone: "neutral", label: "Лише перегляд" },
  expired: { tone: "neutral", label: "Перегляд без застосування" },
};

/** Що саме погоджує власник: показуємо і у формі створення, і у вікні підтвердження. */
const RESPONSIBILITY =
  "Я, власник закладу, дозволяю AI-агенту за цим посиланням змінювати й видаляти дані цієї філії без підтвердження кожної дії в RosterMind і беру відповідальність за ці зміни на себе.";

function humanError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message || fallback : fallback;
}

function CopyButton({ text, label, primary = false }: { text: string; label: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <button type="button" className={primary ? "btn" : "btn ghost"} onClick={copy}>
      <IconCopy />{copied ? "Скопійовано!" : label}
    </button>
  );
}

/** Запасний шлях, коли асистент не може додати сервер сам: куди вставити посилання. */
function ManualSetup({ url }: { url: string }) {
  return (
    <details className="ai-manual">
      <summary>Якщо асистент не може підключитися сам</summary>
      <p>Вставте посилання вручну в налаштуваннях асистента як MCP-сервер (тип <code>streamable-http</code>, без логіна й пароля):</p>
      <ul>
        <li><b>OpenClaw</b> — Control UI → Settings → MCP Servers.</li>
        <li><b>Claude</b> — Налаштування → Конектори → «Додати власний конектор».</li>
        <li><b>ChatGPT</b> — налаштування застосунків і конекторів, режим розробника → новий конектор без автентифікації.</li>
        <li><b>Claude Code</b> — <code>claude mcp add --transport http rostermind {url}</code></li>
      </ul>
      <p>
        Для OpenClaw і Claude можна додатково встановити навичку з описом даних:{" "}
        <a className="link" href={aiAccessLinks.skill("read")}><IconDownload />SKILL.md (читання)</a>{" · "}
        <a className="link" href={aiAccessLinks.skill("write")}><IconDownload />SKILL.md (читання й зміни)</a>
      </p>
    </details>
  );
}

/* ═══════════ Модалка «посилання показується один раз» ═══════════ */

function CreatedModal({ token, onClose }: { token: McpTokenCreated; onClose: () => void }) {
  const { dialogRef, titleId } = useModalAccessibility<HTMLDivElement>(onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={dialogRef} className="modal-card ai-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 id={titleId}>Доступ «{token.label}» створено</h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          <div className="form-error">
            Скопіюйте зараз — вдруге посилання не покажемо. Хто має посилання, той бачить усі дані закладу
            {token.access_mode === "write" ? " і може їх змінювати" : ""}.
          </div>
          {token.write_status === "pending" && (
            <p className="ai-hint">Зміни запрацюють після підтвердження власником закладу — до того асистент лише читає.</p>
          )}
          <div className="fsection first">Повідомлення для асистента</div>
          <pre className="ai-message">{token.assistant_message}</pre>
          <div className="link-actions">
            <CopyButton text={token.assistant_message} label="Скопіювати повідомлення" primary />
            <CopyButton text={token.url} label="Лише посилання" />
          </div>
          <p className="ai-hint">
            Надішліть це повідомлення людині, яка підключає асистента, або вставте його в чат OpenClaw чи Claude — асистент додасть сервер сам.
          </p>
          <ManualSetup url={token.url} />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════ Сторінка ═══════════ */

export function AiAccessPage() {
  const qc = useQueryClient();
  const list = useQuery(aiAccessQueries.list());
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [term, setTerm] = useState("");
  const [created, setCreated] = useState<McpTokenCreated | null>(null);
  const [revoking, setRevoking] = useState<McpToken | null>(null);
  const [mode, setMode] = useState<AccessMode>("read");
  const [consent, setConsent] = useState(false);
  const [approving, setApproving] = useState<McpToken | null>(null);
  const [approveConsent, setApproveConsent] = useState(false);
  const [withdrawing, setWithdrawing] = useState<McpToken | null>(null);
  const [tab, setTab] = useState<"links" | "changes">("links");
  const [error, setError] = useState<string | null>(null);
  const summary = useQuery(dashboardQueries.summary());
  const isOwner = summary.data?.user.role === "owner";

  const refresh = () => qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
  const create = useMutation({
    mutationFn: aiAccessApi.create,
    onSuccess: (token) => {
      setCreating(false);
      setLabel("");
      setTerm("");
      setMode("read");
      setConsent(false);
      setError(null);
      setCreated(token);
      refresh();
    },
    onError: (e) => setError(humanError(e, "Не вдалося створити доступ")),
  });
  const revoke = useMutation({
    mutationFn: (id: number) => aiAccessApi.revoke(id),
    onSuccess: () => { setRevoking(null); refresh(); },
    onError: (e) => setError(humanError(e, "Не вдалося відкликати доступ")),
  });
  const approve = useMutation({
    mutationFn: (id: number) => aiAccessApi.approveWrite(id),
    onSuccess: () => { setApproving(null); setApproveConsent(false); refresh(); },
    onError: (e) => setError(humanError(e, "Не вдалося підтвердити зміни")),
  });
  const withdraw = useMutation({
    mutationFn: (id: number) => aiAccessApi.withdrawWrite(id),
    onSuccess: () => { setWithdrawing(null); refresh(); },
    onError: (e) => setError(humanError(e, "Не вдалося зняти дозвіл")),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    create.mutate({
      label: label.trim(),
      expires_in_days: term ? Number(term) : null,
      access_mode: mode,
      confirm_responsibility: mode === "write" && isOwner && consent,
    });
  }

  const data = list.data;
  const enabled = data?.enabled ?? false;

  return (
    <PageShell
      title="Доступ для AI"
      subtitle="Підключіть AI-асистента до даних філії: лише читання або читання й зміни"
      actions={
        enabled ? (
          <button type="button" className="btn" aria-label="Створити доступ" onClick={() => { setError(null); setCreating(true); }}>
            <IconPlus /><span>Створити доступ</span>
          </button>
        ) : undefined
      }
    >
      {list.isLoading && <div className="link-meta">Завантаження…</div>}
      {data && !enabled && (
        <EmptyState title="Доступ для AI ще не ввімкнено">
          <p>Функцію вмикає команда RosterMind на сервері. Напишіть у підтримку, і ми ввімкнемо її для вашого закладу.</p>
        </EmptyState>
      )}

      {data && enabled && (
        <div className="ai-page">
          {error && <div className="form-error">{error}</div>}
          <div className="seg ai-tabs" role="tablist" aria-label="Розділи">
            <button type="button" role="tab" aria-selected={tab === "links"} className={tab === "links" ? "on" : ""} onClick={() => setTab("links")}>
              Доступи
            </button>
            <button type="button" role="tab" aria-selected={tab === "changes"} className={tab === "changes" ? "on" : ""} onClick={() => setTab("changes")}>
              Зміни від AI
            </button>
          </div>

          {tab === "changes" && <AiChangesTab />}

          {tab === "links" && <>
          <div className="rcard">
            <div className="rcard-head">
              <div>
                <h3>Як підключити асистента</h3>
                <p>OpenClaw, Claude, ChatGPT та інші асистенти, що підтримують MCP</p>
              </div>
            </div>
            <div className="rcard-body">
              <ol className="ai-steps">
                <li>Натисніть «Створити доступ», дайте назву — наприклад, «OpenClaw директора» — і оберіть, що дозволено: лише читання чи читання й зміни.</li>
                <li>Скопіюйте готове повідомлення й надішліть людині, яка підключає асистента, або вставте його асистенту самі. Він налаштує все сам.</li>
                <li>Перевірте: попросіть асистента «покажи огляд закладу».</li>
              </ol>
              <p className="ai-hint">
                Асистент бачить учнів, контакти батьків і критерії вразливості, розклад, відвідуваність, журнал, зарплати та аналітику.
                З правом змін він також додає й змінює учнів, групи, гуртки, розклад, вчителів (і їхні кабінети, ставки й нарахування), календар, критерії вразливості й відмітки уроків:
                кожну зміну спершу переглядає, а руйнівні — лише після вашої згоди в чаті з ним. Усе видно в «Зміни від AI» та «Історії змін».
                Дозвіл на зміни дає лише власник закладу. Посилання працює як пароль: якщо засумнівались — відкличте його й створіть нове.
              </p>
              <ManualSetup url={`${data.base_url}/…`} />
            </div>
          </div>

          {data.tokens.length === 0 ? (
            <EmptyState title="Доступів ще немає">
              <p>Створіть перший — наприклад, «OpenClaw директора».</p>
            </EmptyState>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>Назва</th>
                  <th>Дозволено</th>
                  <th>Статус</th>
                  <th>Створено</th>
                  <th>Діє до</th>
                  <th>Останній запит</th>
                  <th className="col-center">Запитів</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.tokens.map((t) => (
                  <tr key={t.id}>
                    <td className="cell-name">{t.label}</td>
                    <td>
                      {t.access_mode === "read" ? "Читання" : "Читання й зміни"}
                      {t.write_status === "pending" && (
                        <div><StatusTag tone="enroll">Чекає підтвердження власника</StatusTag></div>
                      )}
                      {t.write_status === "approved" && (
                        <div className="ai-approved">
                          Підтвердив {t.write_approved_by ?? "власник"}
                          {t.write_approved_at ? `, ${formatDateTimeUk(t.write_approved_at)}` : ""}
                        </div>
                      )}
                    </td>
                    <td><StatusTag tone={STATUS[t.status].tone}>{STATUS[t.status].label}</StatusTag></td>
                    <td className="tnum">{formatDateTimeUk(t.created_at)}</td>
                    <td className="tnum">{t.expires_at ? formatDateTimeUk(t.expires_at) : "Безстроково"}</td>
                    <td className="tnum">{t.last_used_at ? formatDateTimeUk(t.last_used_at) : "Ще не використовувався"}</td>
                    <td className="col-center tnum">{t.use_count}</td>
                    <td>
                      {t.status === "active" && (
                        <div className="ai-row-actions">
                          {t.write_status === "pending" && isOwner && (
                            <button type="button" className="btn ghost" onClick={() => { setApproveConsent(false); setApproving(t); }}>
                              Підтвердити зміни
                            </button>
                          )}
                          {t.write_status === "approved" && (
                            <button type="button" className="btn ghost" onClick={() => setWithdrawing(t)}>
                              Зняти дозвіл на зміни
                            </button>
                          )}
                          <button type="button" className="btn ghost danger-ghost" onClick={() => setRevoking(t)}>
                            <IconClose />Відкликати
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
          </>}
        </div>
      )}

      {creating && (
        <FormModal
          title="Новий доступ для AI"
          submitLabel="Створити посилання"
          pending={create.isPending}
          submitDisabled={!label.trim() || (mode === "write" && isOwner && !consent)}
          onSubmit={submit}
          onClose={() => setCreating(false)}
        >
          {error && <div className="form-error">{error}</div>}
          <div className="field">
            <label htmlFor="ai-label">Назва</label>
            <input id="ai-label" value={label} maxLength={100} placeholder="OpenClaw директора" autoFocus onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ai-term">Строк дії</label>
            <select id="ai-term" value={term} onChange={(e) => setTerm(e.target.value)}>
              {TERMS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Що дозволено</label>
            <div className="ai-modes" role="radiogroup" aria-label="Що дозволено">
              {MODES.map((m) => (
                <label key={m.value} className={`ai-mode${mode === m.value ? " on" : ""}`}>
                  <input type="radio" name="ai-mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} />
                  <span className="ai-mode-ic" aria-hidden="true">{m.icon}</span>
                  <span className="ai-mode-text"><b>{m.title}</b><small>{m.sub}</small></span>
                  <span className="ai-mode-dot" aria-hidden="true" />
                </label>
              ))}
            </div>
          </div>
          {mode === "write" && (isOwner ? (
            <label className={`check ai-consent${consent ? " on" : ""}`}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{RESPONSIBILITY}</span>
            </label>
          ) : (
            <p className="ai-hint">Зміни запрацюють, коли їх підтвердить власник закладу. До того асистент лише читає.</p>
          ))}
          <p className="ai-warning">
            Асистент бачитиме <b>всі дані закладу</b>, включно з контактами батьків і критеріями вразливості дітей. Дані передаються сервісу AI, який ви підключаєте.
          </p>
        </FormModal>
      )}

      {created && <CreatedModal token={created} onClose={() => setCreated(null)} />}

      {approving && (
        <FormModal
          title={`Дозволити зміни для «${approving.label}»?`}
          submitLabel="Дозволити зміни"
          pending={approve.isPending}
          submitDisabled={!approveConsent}
          onSubmit={(e) => { e.preventDefault(); approve.mutate(approving.id); }}
          onClose={() => setApproving(null)}
        >
          <p className="ai-hint" style={{ marginTop: 0 }}>
            Асистент зможе додавати, змінювати й видаляти учнів, групи, гуртки, розклад, вчителів (з кабінетами, ставками й нарахуваннями), календар, критерії вразливості й відмітки уроків цієї філії.
            Кожну зміну він спершу переглядає, а руйнівні застосовує лише після згоди людини в чаті з ним. Зняти дозвіл можна будь-коли — одразу.
          </p>
          <label className={`check ai-consent${approveConsent ? " on" : ""}`}>
            <input type="checkbox" checked={approveConsent} onChange={(e) => setApproveConsent(e.target.checked)} />
            <span>{RESPONSIBILITY}</span>
          </label>
        </FormModal>
      )}

      {withdrawing && (
        <ConfirmDialog
          title="Зняти дозвіл на зміни?"
          confirmLabel="Зняти дозвіл"
          pending={withdraw.isPending}
          onClose={() => setWithdrawing(null)}
          onConfirm={() => withdraw.mutate(withdrawing.id)}
        >
          <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
            Асистент «{withdrawing.label}» <b>одразу перестане змінювати дані</b>, але далі читатиме. Знову дозволити зміни може власник.
          </p>
        </ConfirmDialog>
      )}

      {revoking && (
        <ConfirmDialog
          title="Відкликати доступ?"
          confirmLabel="Відкликати"
          pending={revoke.isPending}
          onClose={() => setRevoking(null)}
          onConfirm={() => revoke.mutate(revoking.id)}
        >
          <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
            Асистент «{revoking.label}» <b>одразу втратить доступ</b> до даних закладу. Скасувати це не можна — лише створити новий доступ.
          </p>
        </ConfirmDialog>
      )}
    </PageShell>
  );
}


/* ═══════════ Вкладка «Зміни від AI» ═══════════ */

function AiChangesTab() {
  const [limit, setLimit] = useState(30);
  const [appliedOnly, setAppliedOnly] = useState(true);
  const changes = useQuery(aiAccessQueries.changes(limit, appliedOnly));
  const items = changes.data?.items ?? [];
  return (
    <div className="rcard">
      <div className="rcard-head">
        <div>
          <h3>Зміни від AI</h3>
          <p>Що змінювали асистенти цієї філії — з планом, наслідками й тим, хто погодив</p>
        </div>
        <label className={`check${appliedOnly ? " on" : ""}`}>
          <input type="checkbox" checked={appliedOnly} onChange={(e) => setAppliedOnly(e.target.checked)} />
          Лише застосовані
        </label>
      </div>
      <div className="rcard-body">
        {changes.isLoading && <div className="link-meta">Завантаження…</div>}
        {changes.data && items.length === 0 && (
          <EmptyState title="Змін від AI ще немає">
            <p>Коли асистент з правом змін щось змінить, це з'явиться тут і в «Історії змін».</p>
          </EmptyState>
        )}
        <ul className="ai-changes">
          {items.map((c) => (
            <li key={c.id}>
              <div className="ai-change-head">
                <StatusTag tone={CHANGE_STATUS[c.status].tone}>{CHANGE_STATUS[c.status].label}</StatusTag>
                {c.destructive && <StatusTag tone="delete">Руйнівна</StatusTag>}
                <span className="ai-change-summary">{c.summary ?? c.tool}</span>
              </div>
              <div className="ai-change-meta">
                {formatDateTimeUk(c.applied_at ?? c.created_at)} · {c.token_label}
                {c.human_confirmation ? ` · погоджено: ${c.human_confirmation}` : ""}
              </div>
              {c.error && <div className="form-error">{c.error}</div>}
              <details className="ai-manual">
                <summary>Подробиці</summary>
                {!!c.plan.effects?.length && <ul>{c.plan.effects.map((e) => <li key={e}>{e}</li>)}</ul>}
                {!!c.plan.warnings?.length && <ul>{c.plan.warnings.map((w) => <li key={w}>Увага: {w}</li>)}</ul>}
                <pre className="ai-message">{JSON.stringify({ зміни: c.plan.changes, результат: c.result }, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
        {changes.data?.has_more && (
          <button type="button" className="btn ghost" onClick={() => setLimit((n) => n + 30)}>Показати ще</button>
        )}
      </div>
    </div>
  );
}
