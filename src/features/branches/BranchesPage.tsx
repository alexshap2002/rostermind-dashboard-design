import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog, EmptyState, FormModal, PageShell, StatusTag } from "../../components/admin/primitives";
import { dashboardQueries } from "../dashboard/api";
import { ApiError, newRequestId } from "../../lib/api";
import { formatDateUk, formatDayMonth, formatNumber, pluralUk } from "../../lib/format";
import { SMALL_MAX_KIDS, hrn, kids, paidNote, payTone } from "../../lib/billing";
import { IconPencil, IconPlus, IconSend } from "../../lib/icons";
import { SUPPORT_NICK, SUPPORT_URL } from "../onboarding/content";
import { branchesApi, branchesQueries, enterBranch, type Branch } from "./api";

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : "Не вдалося виконати дію. Спробуйте ще раз.");

/** Текст у буфер і чат підтримки в новій вкладці: t.me не вміє передзаповнювати особисті чати. */
function copyAndOpenChat(text: string, onDone: (copied: boolean) => void) {
  // Без буфера (старий браузер, не https) показуємо текст, щоб скопіювати вручну.
  const copying = navigator.clipboard?.writeText(text);
  if (copying) copying.then(() => onDone(true), () => onDone(false));
  else onDone(false);
  window.open(SUPPORT_URL, "_blank", "noopener,noreferrer");
}

type Modal = { kind: "create" } | { kind: "rename"; branch: Branch };

export function BranchesPage() {
  const qc = useQueryClient();
  const summary = useQuery(dashboardQueries.summary());
  const role = summary.data?.user.role;
  const list = useQuery({ ...branchesQueries.list(), enabled: role === "owner" });
  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState<Modal | null>(null);
  const [toDelete, setToDelete] = useState<Branch | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // «Додати філію» з перемикача в шапці веде сюди з ?new=1
  useEffect(() => {
    if (role !== "owner" || params.get("new") !== "1") return;
    setModal({ kind: "create" });
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true });
  }, [params, role, setParams]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["owner-branches"] });
    qc.invalidateQueries({ queryKey: ["network"] });
    qc.invalidateQueries({ queryKey: ["main-branch"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const remove = useMutation({
    mutationFn: (b: Branch) => branchesApi.remove(b.tenant_id, b.tenant_name),
    onSuccess: (_, b) => {
      setToDelete(null);
      setNotice(`Філію «${b.tenant_name}» видалено.`);
      refresh();
    },
  });

  if (summary.data && role !== "owner") {
    return (
      <PageShell title="Філії й оплата">
        <EmptyState title="Доступно лише власнику">Ця сторінка — для власника мережі філій.</EmptyState>
      </PageShell>
    );
  }

  const branches = list.data?.branches ?? [];
  const ownerLogin = list.data?.owner_login ?? "";
  // Спершу те, що потребує дії: прострочені, потім ті, що чекають оплати.
  const rank = (b: Branch) =>
    b.lifecycle_status === "active" && b.paid_until && payTone(b.paid_until) === "overdue" ? 0
      : b.lifecycle_status === "onboarding" ? 1
        : b.lifecycle_status === "active" ? 2 : 3;
  const ordered = [...branches].sort((a, b) => rank(a) - rank(b));

  return (
    <PageShell
      title="Філії й оплата"
      subtitle="Додавайте філії, призначайте адміністраторів і стежте за оплатою"
      actions={
        <button type="button" className="btn keep-label" onClick={() => { setNotice(null); setModal({ kind: "create" }); }}>
          <IconPlus /><span>Додати філію</span>
        </button>
      }
    >
      <div className="br-page">
        {list.error instanceof ApiError && (
          <div className="form-error">
            {list.error.message}
            <button type="button" className="btn ghost sm keep-label" style={{ marginLeft: 10 }} onClick={() => list.refetch()}><span>Спробувати ще</span></button>
          </div>
        )}
        {notice && (
          <div className="form-ok br-notice">
            <span>{notice}</span>
            <button type="button" className="link" onClick={() => setNotice(null)}>Закрити</button>
          </div>
        )}

        {list.data && <PaySummary branches={branches} ownerLogin={ownerLogin} />}

        {list.isLoading && <div className="empty-inline">Завантаження філій…</div>}
        <div className="br-grid">
          {ordered.map((b) => (
            <BranchCard
              key={b.tenant_id}
              branch={b}
              ownerLogin={ownerLogin}
              onRename={() => { setNotice(null); setModal({ kind: "rename", branch: b }); }}
              onDelete={() => { remove.reset(); setToDelete(b); }}
            />
          ))}
        </div>
      </div>

      {modal?.kind === "create" && (
        <BranchNameModal
          title="Додати філію"
          submitLabel="Додати"
          initialName=""
          hint={
            <ol className="br-steps">
              <li>Філія з'явиться зі статусом «Чекає оплати».</li>
              <li>Напишіть нам у Telegram {SUPPORT_NICK} — надішлемо рахунок.</li>
              <li>Після оплати увімкнемо філію того ж дня.</li>
            </ol>
          }
          onSave={(name, key) => branchesApi.create(name, key)}
          onDone={(name) => { setModal(null); setNotice(`Філію «${name}» додано. Напишіть нам у Telegram — надішлемо рахунок.`); refresh(); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "rename" && (
        <BranchNameModal
          title="Перейменувати філію"
          submitLabel="Зберегти"
          initialName={modal.branch.tenant_name}
          onSave={(name) => branchesApi.rename(modal.branch.tenant_id, name)}
          onDone={() => { setModal(null); setNotice("Назву збережено."); refresh(); }}
          onClose={() => setModal(null)}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          title={`Видалити філію «${toDelete.tenant_name}»?`}
          confirmLabel="Видалити"
          pending={remove.isPending}
          error={remove.error ? errorText(remove.error) : null}
          onConfirm={() => remove.mutate(toDelete)}
          onClose={() => setToDelete(null)}
        >
          Філія ще не активована, даних у ній немає. Якщо передумаєте — додасте її знову.
        </ConfirmDialog>
      )}
    </PageShell>
  );
}

/** Скільки, коли й кому платити — головне, що власник шукає на цій сторінці. */
function PaySummary({ branches, ownerLogin }: { branches: Branch[]; ownerLogin: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const active = branches.filter((b) => b.lifecycle_status === "active");
  const pending = branches.filter((b) => b.lifecycle_status === "onboarding");
  // Безкоштовні філії (особливі умови від RosterMind) не платять і «оплачено до» не мають.
  const paying = active.filter((b) => b.price_mode !== "free");
  const freeCount = active.length - paying.length;
  const pendingPaying = pending.filter((b) => b.price_mode !== "free");
  const monthly = paying.reduce((sum, b) => sum + b.monthly_price_uah, 0);

  // 2 × 999 ₴ + 1 × 599 ₴ + 1 безкоштовно
  const byPrice = new Map<number, number>();
  for (const b of paying) byPrice.set(b.monthly_price_uah, (byPrice.get(b.monthly_price_uah) ?? 0) + 1);
  const breakdown = [
    ...[...byPrice.entries()].sort((a, b) => b[0] - a[0]).map(([price, n]) => `${n} × ${hrn(price)}`),
    ...(freeCount ? [`${freeCount} безкоштовно`] : []),
  ].join(" + ");
  const anyTariff = [...active, ...pending].some((b) => b.price_mode === "tariff");

  // Платежі за датами «оплачено до»: найближча дата — її сума й філії.
  const byDate = new Map<string, Branch[]>();
  for (const b of paying) if (b.paid_until) byDate.set(b.paid_until, [...(byDate.get(b.paid_until) ?? []), b]);
  const dates = [...byDate.keys()].sort();
  const due = (date: string) => byDate.get(date) ?? [];
  const sum = (list: Branch[]) => list.reduce((s, b) => s + b.monthly_price_uah, 0);
  const names = (list: Branch[]) => list.map((b) => b.tenant_name).join(", ");
  const next = dates[0];
  const later = dates[1];

  const request = [
    "Добрий день! Надішліть, будь ласка, рахунок за RosterMind.",
    `Акаунт: ${ownerLogin}`,
    ...paying.map((b) => `— ${b.tenant_name}: ${hrn(b.monthly_price_uah)}/міс.${b.paid_until ? `, оплачено до ${formatDateUk(b.paid_until)}` : ""}`),
    ...pendingPaying.map((b) => `— ${b.tenant_name} (нова, ще не активована): ${hrn(b.monthly_price_uah)}/міс.`),
  ].join("\n");

  return (
    <div className="tile br-pay">
      <section>
        <div className="br-pay-label">Щомісяця</div>
        <div className="br-pay-big num">{hrn(monthly)}</div>
        <div className="br-pay-sub">
          {active.length ? `${formatNumber(active.length)} ${pluralUk(active.length, "активна філія", "активні філії", "активних філій")} · ${breakdown}` : "Активних філій ще немає"}
        </div>
        <div className="br-pay-sub">Акаунт власника — безкоштовний</div>
      </section>

      <section className={next ? `is-${payTone(next)}` : undefined}>
        <div className="br-pay-label">{next && payTone(next) === "overdue" ? "Прострочено" : "Наступна оплата"}</div>
        {next ? (
          <>
            <div className="br-pay-big num">
              {payTone(next) === "overdue" ? hrn(sum(due(next))) : `до ${formatDayMonth(next)} — ${hrn(sum(due(next)))}`}
            </div>
            <div className="br-pay-sub">
              {names(due(next))} · {payTone(next) === "overdue" ? `оплачено до ${formatDayMonth(next)}, ${paidNote(next)}` : paidNote(next)}
            </div>
            {later && <div className="br-pay-sub">далі {formatDayMonth(later)} — {hrn(sum(due(later)))} · {names(due(later))}</div>}
          </>
        ) : (
          <>
            <div className="br-pay-big num">—</div>
            <div className="br-pay-sub">Дата з'явиться після першої оплати</div>
          </>
        )}
      </section>

      <section>
        <div className="br-pay-label">Як оплатити</div>
        {paying.length || pendingPaying.length ? (
          <>
            <p className="br-pay-text">Рахунок надсилаємо в Telegram {SUPPORT_NICK}. Після оплати продовжимо «оплачено до».</p>
            <div className="br-pay-actions">
              <button type="button" className="btn keep-label" onClick={() => copyAndOpenChat(request, setCopied)}>
                <IconSend /><span>Отримати рахунок</span>
              </button>
            </div>
            {copied === true && <div className="br-pay-sub">Текст скопійовано — вставте його в чат.</div>}
            {copied === false && <pre className="br-copy-fallback">{request}</pre>}
          </>
        ) : (
          <p className="br-pay-text">Оплачувати нічого не потрібно — для вас діють особливі умови.</p>
        )}
        {pendingPaying.length > 0 && (
          <div className="br-pay-sub">Чекає оплати: {pendingPaying.map((b) => `${b.tenant_name} — ${hrn(b.monthly_price_uah)}/міс.`).join(", ")}</div>
        )}
        {anyTariff && <div className="br-pay-sub">599 ₴ на місяць до {SMALL_MAX_KIDS} дітей у базі, 999 ₴ — понад {SMALL_MAX_KIDS}.</div>}
      </section>
    </div>
  );
}

function BranchCard({
  branch: b,
  ownerLogin,
  onRename,
  onDelete,
}: {
  branch: Branch;
  ownerLogin: string;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const isPending = b.lifecycle_status === "onboarding";
  const isActive = b.lifecycle_status === "active";
  const isFree = b.price_mode === "free";
  const tone = isActive && b.paid_until && !isFree ? payTone(b.paid_until) : null;
  const toBig = SMALL_MAX_KIDS + 1 - b.current_students;

  async function go(next: string) {
    // У філію сесії перемикатися не треба
    if (b.is_active_context) {
      window.location.assign(next);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await enterBranch(b.tenant_id, b.tenant_name, next);
    } catch (err) {
      setBusy(false);
      setError(errorText(err));
    }
  }

  const request = isFree
    ? `Добрий день! Хочу підключити філію «${b.tenant_name}» (акаунт ${ownerLogin}).`
    : `Добрий день! Хочу підключити філію «${b.tenant_name}» (акаунт ${ownerLogin}). Надішліть, будь ласка, рахунок на ${hrn(b.monthly_price_uah)}/міс.`;

  return (
    <div className="tile br-card">
      <div className="br-head">
        <h3 title={b.tenant_name}>{b.tenant_name}</h3>
        <button type="button" className="br-rename" aria-label={`Перейменувати філію «${b.tenant_name}»`} title="Перейменувати" onClick={onRename}>
          <IconPencil />
        </button>
        {tone === "overdue" && <StatusTag tone="delete">Прострочено</StatusTag>}
        {isPending && <StatusTag tone="enroll">Чекає оплати</StatusTag>}
        {!isActive && !isPending && <StatusTag tone="delete">Недоступна</StatusTag>}
      </div>

      {isPending ? (
        <ol className="br-steps br-pending">
          {isFree ? (
            <li>Напишіть нам у Telegram — увімкнемо філію того ж дня.</li>
          ) : (
            <>
              <li>Напишіть нам у Telegram — надішлемо рахунок на {hrn(b.monthly_price_uah)}/міс.</li>
              <li>Оплатіть рахунок.</li>
              <li>Увімкнемо філію того ж дня.</li>
            </>
          )}
        </ol>
      ) : (
        <>
          <div>
            {isFree ? (
              <div className="br-price"><b className="num">0 ₴</b><span>безкоштовно</span></div>
            ) : (
              <div className="br-price"><b className="num">{hrn(b.monthly_price_uah)}</b><span>/міс.</span></div>
            )}
            <div className="br-why">
              {b.price_mode === "tariff" ? (
                <>
                  {kids(b.current_students)} у базі — {b.current_students > SMALL_MAX_KIDS ? `понад ${SMALL_MAX_KIDS}` : `до ${SMALL_MAX_KIDS}`}
                  {toBig > 0 && toBig <= 10 && <b> · ще {formatNumber(toBig)}, і ціна стане 999 ₴</b>}
                </>
              ) : isFree ? (
                "Особливі умови від RosterMind — оплачувати не потрібно"
              ) : (
                "Особлива ціна від RosterMind — не залежить від кількості дітей"
              )}
            </div>
          </div>
          {!isFree && (
            <div className={`br-line${tone ? ` is-${tone}` : ""}`}>
              <span>Оплачено до</span>
              <b className="tnum">{b.paid_until ? `${formatDateUk(b.paid_until)} · ${paidNote(b.paid_until)}` : "дату не вказано"}</b>
            </div>
          )}
          <div className="br-line">
            <span>{b.admin_names.length > 1 ? "Адміністратори" : "Адміністратор"}</span>
            <b>{b.admin_names.length ? b.admin_names.join(", ") : "ще не призначено"}</b>
          </div>
        </>
      )}

      {error && <div className="form-error" role="alert">{error}</div>}
      {copied === true && <div className="br-why">Текст скопійовано — вставте його в чат.</div>}
      {copied === false && <pre className="br-copy-fallback">{request}</pre>}

      <div className="br-actions">
        {isActive && (
          <>
            <button type="button" className="btn keep-label br-open" disabled={busy} onClick={() => go("/")}>
              <span>{busy ? "Переходимо…" : "Відкрити філію"}</span>
            </button>
            <button type="button" className="link" disabled={busy} onClick={() => go("/users?new=1")}>
              Додати адміністратора
            </button>
          </>
        )}
        {isPending && (
          <button type="button" className="btn keep-label br-open" onClick={() => copyAndOpenChat(request, setCopied)}>
            <IconSend /><span>Написати в Telegram</span>
          </button>
        )}
        {b.capabilities.can_delete && (
          <button type="button" className="link br-danger" onClick={onDelete}>Видалити</button>
        )}
      </div>
    </div>
  );
}

function BranchNameModal({
  title,
  submitLabel,
  initialName,
  hint,
  onSave,
  onDone,
  onClose,
}: {
  title: string;
  submitLabel: string;
  initialName: string;
  hint?: ReactNode;
  onSave: (name: string, idempotencyKey: string) => Promise<unknown>;
  onDone: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  // Один ключ на відкрите вікно: подвійний клік не створить дві філії.
  const [idempotencyKey] = useState(() => newRequestId());
  const save = useMutation({
    mutationFn: (value: string) => onSave(value, idempotencyKey),
    onSuccess: (_, value) => onDone(value),
  });
  const trimmed = name.trim();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (trimmed.length >= 2) save.mutate(trimmed);
  }

  return (
    <FormModal
      title={title}
      submitLabel={submitLabel}
      pending={save.isPending}
      submitDisabled={trimmed.length < 2 || trimmed === initialName}
      error={save.error ? errorText(save.error) : null}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <div className="field">
        <label htmlFor="branch-name">Назва філії</label>
        <input
          id="branch-name"
          autoFocus
          maxLength={200}
          value={name}
          placeholder="Наприклад: Оболонь"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {hint}
      {hint && <p className="br-modal-price">Ціна — 599 ₴ на місяць до {SMALL_MAX_KIDS} дітей і 999 ₴, якщо більше.</p>}
    </FormModal>
  );
}
