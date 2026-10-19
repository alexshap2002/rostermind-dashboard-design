import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, PageError, StatusTag } from "../../components/admin/primitives";
import { hrn, paidNote, payTone, todayIso } from "../../lib/billing";
import { formatDateUk, formatNumber, formatPhoneUk, pluralUk } from "../../lib/format";
import { IconPlus } from "../../lib/icons";
import { platformQueries, type PlatformOwner, type PlatformTenant } from "./api";
import { ExtendModal } from "./ExtendModal";
import { NewSchoolModal } from "./NewSchoolModal";
import { PlatformShell } from "./PlatformShell";
import { PriceTermsModal } from "./PriceTermsModal";
import { groupSchools, priceTermsText, reminderText, schoolStatus } from "./schools";

/** Заклад чи мережа, над якими відкрито діалог, і які філії в ньому позначено. */
type Picked = { tenants: PlatformTenant[]; ids: number[] };

/** «Заклади»: усі заклади за терміновістю, мережі разом, «Продовжити» в один діалог. */
export function SchoolsPage() {
  const tenants = useQuery(platformQueries.tenants());
  const me = useQuery(platformQueries.me());
  const [extending, setExtending] = useState<Picked | null>(null);
  const [terms, setTerms] = useState<Picked | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // null — закрито; {} — «Новий заклад»; {owner} — одразу для наявного власника.
  const [creating, setCreating] = useState<{ owner?: PlatformOwner } | null>(null);
  const rows = useMemo(() => tenants.data ?? [], [tenants.data]);
  const groups = useMemo(() => groupSchools(rows), [rows]);

  return (
    <PlatformShell
      title="Заклади"
      subtitle={tenants.data ? <SummaryLine rows={rows} /> : "Завантаження…"}
      actions={<button type="button" className="btn keep-label" onClick={() => setCreating({})}><IconPlus /><span>Новий заклад</span></button>}
    >
      {notice && <div className="form-ok">{notice}</div>}
      {me.data && !me.data.totp_enabled && (
        <div className="form-warn">
          Увімкніть код входу з телефона — тоді одного пароля буде замало, щоб відкрити кабінет. <Link to="/platform/security">«Безпека»</Link>
        </div>
      )}
      {tenants.error && <PageError error={tenants.error} onRetry={() => tenants.refetch()} />}
      {tenants.data && rows.length === 0 && <EmptyState title="Закладів ще немає" />}

      <div className="pf-list">
        {groups.map((group) =>
          group.length > 1 ? (
            <section key={`net-${group[0].owner?.account_id}`} className="pf-net">
              <NetworkHead
                group={group}
                onAdd={() => setCreating({ owner: group[0].owner ?? undefined })}
                onExtend={() => setExtending({ tenants: group, ids: group.filter((t) => t.price_mode !== "free").map((t) => t.tenant_id) })}
                onTerms={() => setTerms({ tenants: group, ids: group.map((t) => t.tenant_id) })}
              />
              {group.map((t) => (
                <SchoolCard
                  key={t.tenant_id}
                  tenant={t}
                  onExtend={() => setExtending({ tenants: group, ids: [t.tenant_id] })}
                  onTerms={() => setTerms({ tenants: group, ids: [t.tenant_id] })}
                />
              ))}
            </section>
          ) : (
            <SchoolCard
              key={group[0].tenant_id}
              tenant={group[0]}
              onExtend={() => setExtending({ tenants: group, ids: [group[0].tenant_id] })}
              onTerms={() => setTerms({ tenants: group, ids: [group[0].tenant_id] })}
            />
          ),
        )}
      </div>

      {creating && <NewSchoolModal owner={creating.owner} onClose={() => setCreating(null)} />}

      {terms && (
        <PriceTermsModal
          tenants={terms.tenants}
          initialIds={terms.ids}
          onClose={() => setTerms(null)}
          onDone={(message) => {
            setTerms(null);
            setNotice(message);
          }}
        />
      )}

      {extending && (
        <ExtendModal
          tenants={extending.tenants}
          initialIds={extending.ids}
          onClose={() => setExtending(null)}
          onDone={(message) => {
            setExtending(null);
            setNotice(message);
          }}
        />
      )}
    </PlatformShell>
  );
}

/** Найближча оплата, те, що потребує дії, і скільки приходить щомісяця (безкоштовні — окремо). */
function SummaryLine({ rows }: { rows: PlatformTenant[] }) {
  const working = rows.filter((t) => !t.is_demo && t.has_subscription && t.lifecycle_status === "active");
  const paying = working.filter((t) => t.price_mode !== "free");
  const free = working.length - paying.length;
  const live = paying.filter((t) => t.paid_until);
  const overdue = live.filter((t) => payTone(t.paid_until!) === "overdue").length;
  const next = live
    .filter((t) => t.paid_until! >= todayIso())
    .sort((a, b) => a.paid_until!.localeCompare(b.paid_until!))[0];
  const waiting = rows.filter((t) => !t.is_demo && t.lifecycle_status === "onboarding").length;
  const noSub = rows.filter((t) => !t.is_demo && !t.has_subscription).length;
  const parts = [
    next ? `Наступна оплата ${formatDateUk(next.paid_until)} · ${next.name} · ${hrn(next.price_uah)}` : "Найближчих оплат немає",
    overdue ? `прострочено: ${formatNumber(overdue)}` : "прострочених немає",
    `чекають активації: ${formatNumber(waiting)}`,
  ];
  if (noSub) parts.push(`без підписки: ${formatNumber(noSub)}`);
  parts.push(
    `щомісяця ${hrn(paying.reduce((sum, t) => sum + t.price_uah, 0))} (платних ${formatNumber(paying.length)}${free ? `, безкоштовно ${formatNumber(free)}` : ""})`,
  );
  return <>{parts.join(" · ")}</>;
}

/** Шапка мережі: скільки філій і разом на місяць; додати заклад, продовжити всю мережу, умови для всіх. */
function NetworkHead({
  group,
  onAdd,
  onExtend,
  onTerms,
}: {
  group: PlatformTenant[];
  onAdd: () => void;
  onExtend: () => void;
  onTerms: () => void;
}) {
  const owner = group[0].owner;
  const paying = group.filter((t) => t.price_mode !== "free");
  const total = paying.reduce((sum, t) => sum + t.price_uah, 0);
  return (
    <div className="pf-net-head">
      <div>
        <b>Мережа · {owner?.full_name || owner?.login}</b>
        <span>
          {formatNumber(group.length)} {pluralUk(group.length, "філія", "філії", "філій")} · {paying.length ? `разом ${hrn(total)}/міс.` : "безкоштовно"}
          {paying.length > 0 && paying.length < group.length ? ` (безкоштовно ${formatNumber(group.length - paying.length)})` : ""}
        </span>
      </div>
      <div className="pf-actions">
        {owner?.is_active !== false && (
          <button type="button" className="btn ghost keep-label" onClick={onAdd}><IconPlus /><span>Додати заклад</span></button>
        )}
        {paying.length > 0 && <button type="button" className="btn ghost keep-label" onClick={onExtend}>Продовжити всю мережу</button>}
        <button type="button" className="btn ghost keep-label" onClick={onTerms}>Умови оплати</button>
      </div>
    </div>
  );
}

function SchoolCard({ tenant: t, onExtend, onTerms }: { tenant: PlatformTenant; onExtend: () => void; onTerms: () => void }) {
  const status = schoolStatus(t);
  const [copied, setCopied] = useState(false);
  const copyReminder = () => {
    navigator.clipboard?.writeText(reminderText(t)).then(() => setCopied(true), () => setCopied(false));
  };
  const free = t.price_mode === "free";
  const tone = t.paid_until && !free ? payTone(t.paid_until) : null;
  const activating = t.lifecycle_status === "onboarding" || !t.has_subscription;

  return (
    <article className={`pf-card${t.is_demo ? " is-demo" : ""}`}>
      <div className="pf-card-head">
        <Link className="pf-name" to={`/platform/schools/${t.tenant_id}`}>{t.name}</Link>
        <StatusTag tone={status.tone}>{status.label}</StatusTag>
      </div>
      <div className="pf-lines">
        <div>
          <span>Оплачено до</span>
          {free ? (
            <b>не потрібно</b>
          ) : t.paid_until ? (
            <b className={tone === "overdue" ? "pf-bad" : tone === "soon" ? "pf-soon" : ""}>
              {formatDateUk(t.paid_until)} · {paidNote(t.paid_until)}
            </b>
          ) : (
            <b>—</b>
          )}
        </div>
        <div>
          <span>Ціна</span>
          <b>{priceTermsText(t)}</b>
        </div>
        <div>
          <span>Вчителі</span>
          <b>{formatNumber(t.teachers)} · у Telegram {formatNumber(t.teachers_in_telegram)}</b>
        </div>
        <div>
          <span>Власник</span>
          <b>
            {t.owner ? (
              <>
                {t.owner.full_name} · {t.owner.login}
                {t.owner.phone && <> · <a href={`tel:${t.owner.phone}`}>{formatPhoneUk(t.owner.phone)}</a></>}
              </>
            ) : (
              "—"
            )}
          </b>
        </div>
      </div>
      <div className="pf-actions">
        {(activating || !free) && (
          <button type="button" className="btn keep-label" onClick={onExtend}>
            {activating ? "Активувати" : "Продовжити"}
          </button>
        )}
        {!activating && !free && (
          <button type="button" className="btn ghost keep-label" onClick={copyReminder}>
            {copied ? "Скопійовано" : "Скопіювати нагадування"}
          </button>
        )}
        {t.has_subscription && (
          <button type="button" className="btn ghost keep-label" onClick={onTerms}>Умови оплати</button>
        )}
      </div>
    </article>
  );
}
