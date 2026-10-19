import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, PageError, StatusTag } from "../../components/admin/primitives";
import { hrn, kids, paidNote } from "../../lib/billing";
import { formatDateUk, formatNumber, formatPhoneUk } from "../../lib/format";
import { platformQueries } from "./api";
import { ActivityList } from "./ActivityPage";
import { ExtendModal } from "./ExtendModal";
import { NewSchoolModal } from "./NewSchoolModal";
import { OwnerContactsModal, TempPasswordModal } from "./OwnerAccessModals";
import { PlatformShell } from "./PlatformShell";
import { PriceTermsModal } from "./PriceTermsModal";
import { schoolStatus } from "./schools";

const TERMS_TITLE = { tariff: "За тарифом", custom: "Своя сума", free: "Безкоштовно" } as const;

/** Картка закладу: оплата, власник, кількості, стрічка дій платформи по ньому. */
export function SchoolPage() {
  const tenantId = Number(useParams().tenantId);
  const tenants = useQuery(platformQueries.tenants());
  const activity = useQuery(platformQueries.activity(tenantId));
  const [extending, setExtending] = useState(false);
  const [editingTerms, setEditingTerms] = useState(false);
  const [adding, setAdding] = useState(false);
  const [ownerDialog, setOwnerDialog] = useState<"password" | "contacts" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tenant = tenants.data?.find((t) => t.tenant_id === tenantId);
  const network = tenant?.owner && tenant.owner.branches > 1
    ? (tenants.data ?? []).filter((t) => t.owner?.account_id === tenant.owner?.account_id)
    : tenant ? [tenant] : [];

  const back = <Link className="btn ghost keep-label" to="/platform">← Усі заклади</Link>;
  if (tenants.error) return <PlatformShell title="Заклад" actions={back}><PageError error={tenants.error} /></PlatformShell>;
  if (!tenants.data) return <PlatformShell title="Заклад" actions={back}><div className="empty-inline">Завантаження…</div></PlatformShell>;
  if (!tenant) return <PlatformShell title="Заклад" actions={back}><EmptyState title="Заклад не знайдено" /></PlatformShell>;

  const status = schoolStatus(tenant);
  const free = tenant.price_mode === "free";
  const activating = tenant.lifecycle_status === "onboarding" || !tenant.has_subscription;
  return (
    <PlatformShell
      title={tenant.name}
      subtitle={<>ID {tenant.tenant_id} · {tenant.slug} · <StatusTag tone={status.tone}>{status.label}</StatusTag></>}
      actions={back}
    >
      {notice && <div className="form-ok">{notice}</div>}
      <div className="pf-detail">
        <section className="tile">
          <div className="tile-head"><h3>Оплата</h3></div>
          <div className="pf-lines">
            <div>
              <span>Умови оплати</span>
              <b>
                {TERMS_TITLE[tenant.price_mode]}
                {tenant.price_mode === "tariff" ? " · 599 ₴ до 70 дітей, 999 ₴ понад 70" : tenant.price_reason ? ` · ${tenant.price_reason}` : ""}
              </b>
            </div>
            <div><span>Ціна</span><b>{free ? "0 ₴ — безкоштовно" : `${hrn(tenant.price_uah)}/міс.`} ({kids(tenant.students)} у базі)</b></div>
            <div>
              <span>Оплачено до</span>
              <b>{free ? "не потрібно" : tenant.paid_until ? `${formatDateUk(tenant.paid_until)} · ${paidNote(tenant.paid_until)}` : "—"}</b>
            </div>
            <div><span>Підписка</span><b>{tenant.has_subscription ? `${tenant.plan_code ?? "—"} · ${tenant.subscription_status ?? "—"}` : "немає"}</b></div>
          </div>
          <div className="pf-actions">
            {(activating || !free) && (
              <button type="button" className="btn keep-label" onClick={() => setExtending(true)}>
                {activating ? "Активувати" : "Продовжити оплату"}
              </button>
            )}
            {tenant.has_subscription && (
              <button type="button" className="btn ghost keep-label" onClick={() => setEditingTerms(true)}>Змінити умови</button>
            )}
          </div>
        </section>

        <section className="tile">
          <div className="tile-head"><h3>Власник</h3></div>
          {tenant.owner ? (
            <div className="pf-lines">
              <div><span>Ім'я</span><b>{tenant.owner.full_name}</b></div>
              <div><span>Логін</span><b>{tenant.owner.login}</b></div>
              <div><span>Телефон</span><b>{tenant.owner.phone ? <a href={`tel:${tenant.owner.phone}`}>{formatPhoneUk(tenant.owner.phone)}</a> : "—"}</b></div>
              <div><span>Мережа</span><b>{tenant.owner.branches > 1 ? `${formatNumber(tenant.owner.branches)} філії` : "одна філія"}</b></div>
              {!tenant.owner.is_active && <div><span>Вхід</span><b className="pf-bad">заблоковано</b></div>}
            </div>
          ) : (
            <div className="empty-inline">Власника не прив'язано</div>
          )}
          {tenant.owner && (
            <div className="pf-actions">
              <button type="button" className="btn ghost keep-label" onClick={() => setOwnerDialog("password")}>Тимчасовий пароль</button>
              <button type="button" className="btn ghost keep-label" onClick={() => setOwnerDialog("contacts")}>Ім'я й телефон</button>
              {tenant.owner.is_active && (
                <button type="button" className="btn ghost keep-label" onClick={() => setAdding(true)}>Додати заклад цьому власнику</button>
              )}
            </div>
          )}
        </section>

        <section className="tile">
          <div className="tile-head"><h3>Заклад</h3></div>
          <div className="pf-lines">
            <div><span>Діти в базі</span><b>{formatNumber(tenant.students)}</b></div>
            <div><span>Вчителі</span><b>{formatNumber(tenant.teachers)}</b></div>
            <div><span>Вчителі в Telegram</span><b>{formatNumber(tenant.teachers_in_telegram)}</b></div>
          </div>
        </section>
      </div>

      <div className="fsection">Стрічка дій</div>
      <ActivityList query={activity} withTenant={false} />

      {editingTerms && (
        <PriceTermsModal
          tenants={network}
          initialIds={[tenant.tenant_id]}
          onClose={() => setEditingTerms(false)}
          onDone={(message) => {
            setEditingTerms(false);
            setNotice(message);
          }}
        />
      )}

      {adding && tenant.owner && <NewSchoolModal owner={tenant.owner} onClose={() => setAdding(false)} />}
      {ownerDialog === "password" && tenant.owner && <TempPasswordModal owner={tenant.owner} onClose={() => setOwnerDialog(null)} />}
      {ownerDialog === "contacts" && tenant.owner && (
        <OwnerContactsModal
          owner={tenant.owner}
          onClose={() => setOwnerDialog(null)}
          onDone={(message) => {
            setOwnerDialog(null);
            setNotice(message);
          }}
        />
      )}

      {extending && (
        <ExtendModal
          tenants={network}
          initialIds={[tenant.tenant_id]}
          onClose={() => setExtending(false)}
          onDone={(message) => {
            setExtending(false);
            setNotice(message);
          }}
        />
      )}
    </PlatformShell>
  );
}
