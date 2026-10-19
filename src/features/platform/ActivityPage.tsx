import { Link } from "react-router-dom";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { PageError } from "../../components/admin/primitives";
import { formatDateTimeUk, formatDateUk } from "../../lib/format";
import { ACTION_LABELS, platformQueries, type PlatformEvent } from "./api";
import { PlatformShell } from "./PlatformShell";

/** «Останні дії»: усе, що робилось у кабінеті платформи, і старі дії зі старого кабінету. */
export function ActivityPage() {
  const activity = useQuery(platformQueries.activity());
  return (
    <PlatformShell title="Останні дії" subtitle="Хто, коли й що змінював у закладах. Паролі й секрети сюди не потрапляють.">
      <ActivityList query={activity} withTenant />
    </PlatformShell>
  );
}

const LOGIN_VIA: Record<string, string> = { password: "паролем", code: "з кодом", emergency: "без коду — аварійний режим" };

function details(event: PlatformEvent): string {
  if (event.action === "login" && typeof event.after?.ip === "string") {
    const via = LOGIN_VIA[String(event.after.via)] ?? "";
    return `IP ${event.after.ip}${via ? ` · ${via}` : ""}`;
  }
  const before = event.before?.paid_until;
  const after = event.after?.paid_until;
  if (typeof after === "string") {
    return `оплачено до: ${typeof before === "string" ? formatDateUk(before) : "—"} → ${formatDateUk(after)}`;
  }
  return "";
}

export function ActivityList({ query, withTenant }: { query: UseQueryResult<PlatformEvent[]>; withTenant: boolean }) {
  if (query.error) return <PageError error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data) return <div className="empty-inline">Завантаження…</div>;
  if (!query.data.length) return <div className="empty-inline">Дій ще не було</div>;
  return (
    <ul className="pf-feed">
      {query.data.map((event, i) => (
        <li key={`${event.at}-${i}`}>
          <div className="pf-feed-when">{formatDateTimeUk(event.at)}</div>
          <div>
            <b>{ACTION_LABELS[event.action] ?? event.action}</b>
            {withTenant && event.tenant_id && (
              <> · <Link to={`/platform/schools/${event.tenant_id}`}>{event.tenant_name ?? `заклад #${event.tenant_id}`}</Link></>
            )}
            {details(event) && <div className="cell-sub">{details(event)}</div>}
            {event.reason && <div className="cell-sub">{event.reason}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}
