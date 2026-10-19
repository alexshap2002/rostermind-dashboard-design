import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { pluralUk } from "../../lib/format";
import { IconBranches, IconBuilding, IconCheck, IconChevron, IconPlus } from "../../lib/icons";
import type { NetworkContext } from "../../features/mainBranch/api";
import { enterBranch, networkHomeHref, nextPathAfterSwitch } from "../../features/branches/api";

type Branch = NetworkContext["branches"][number];

/** Сторінки всієї мережі: тут немає «поточної філії», тож шапка показує режим мережі. */
export const isNetworkPath = (pathname: string) => pathname.startsWith("/main-branch") || pathname.startsWith("/branches");

export function activeBranches(context: NetworkContext | undefined): Branch[] {
  return (context?.branches ?? []).filter((b) => b.lifecycle_status === "active");
}

/** Пункти «Уся мережа» / філії / «Додати філію» — спільні для перемикача в шапці й бургер-меню.
    «Філії й оплата» тут немає: це сторінка мережі — вона в меню посередині, у режимі «Уся мережа».
    «Ви тут» — лише в режимі філії: на сторінках мережі філія сесії для власника нічого не означає. */
export function BranchMenuItems({
  context,
  pathname,
  networkMode,
}: {
  context: NetworkContext;
  pathname: string;
  networkMode: boolean;
}) {
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = activeBranches(context);
  const others = context.branches.filter((b) => b.lifecycle_status !== "active");

  async function open(b: Branch) {
    const next = nextPathAfterSwitch(pathname);
    // У філію сесії перемикатися не треба
    if (b.is_current) {
      navigate(next);
      return;
    }
    setBusyId(b.tenant_id);
    setError(null);
    try {
      await enterBranch(b.tenant_id, b.tenant_name, next);
    } catch (err) {
      setBusyId(null);
      setError(err instanceof ApiError ? err.message : "Не вдалося перейти у філію. Спробуйте ще раз.");
    }
  }

  return (
    <>
      {active.length >= 2 && (
        <Link
          className={`dd-item${networkMode ? " is-here" : ""}`}
          to={networkHomeHref(!networkMode)}
          aria-current={networkMode ? "page" : undefined}
        >
          <span className="dd-ic" style={{ background: "var(--navy-soft)", color: "var(--navy)" }}><IconBuilding /></span>
          <span className="bs-text">
            <span className="dd-t">Уся мережа</span>
            <span className="dd-s">Зведення по {active.length} {pluralUk(active.length, "філії", "філіях", "філіях")}</span>
          </span>
          {networkMode && <IconCheck className="bs-check" />}
        </Link>
      )}
      <div className="bs-head">Філії</div>
      {active.map((b) =>
        b.is_current && !networkMode ? (
          <div className="dd-item is-here" key={b.tenant_id} aria-current="true">
            <span className="dd-ic" style={{ background: "var(--terra-soft)", color: "var(--terra-deep)" }}><IconBranches /></span>
            <span className="bs-text">
              <span className="dd-t">{b.tenant_name}</span>
              <span className="dd-s">Ви тут</span>
            </span>
            <IconCheck className="bs-check" />
          </div>
        ) : (
          <button type="button" className="dd-item" key={b.tenant_id} disabled={busyId !== null} onClick={() => open(b)}>
            <span className="dd-ic" style={{ background: "var(--terra-soft)", color: "var(--terra-deep)" }}><IconBranches /></span>
            <span className="bs-text">
              <span className="dd-t">{b.tenant_name}</span>
              <span className="dd-s">{busyId === b.tenant_id ? "Переходимо…" : "Відкрити філію"}</span>
            </span>
          </button>
        ),
      )}
      {others.map((b) => (
        <Link className="dd-item" key={b.tenant_id} to="/branches">
          <span className="dd-ic" style={{ background: "#f3ede1", color: "var(--text-4)" }}><IconBranches /></span>
          <span className="bs-text"><span className="dd-t">{b.tenant_name}</span></span>
          <span className="tag enroll">{b.lifecycle_status === "onboarding" ? "Чекає оплати" : "Недоступна"}</span>
        </Link>
      ))}
      {error && <div className="form-error bs-error" role="alert">{error}</div>}
      <div className="dd-sep" />
      <Link className="dd-item" to="/branches?new=1">
        <span className="dd-ic" style={{ background: "#f3ede1", color: "var(--text-2)" }}><IconPlus /></span>
        <span className="bs-text"><span className="dd-t">Додати філію</span></span>
      </Link>
    </>
  );
}

/** Перемикач у шапці: «Уся мережа» (синій) або назва філії (темний) — завжди видно, де ви. */
export function BranchSwitcher({
  context,
  pathname,
  networkMode,
  open,
  onToggle,
}: {
  context: NetworkContext;
  pathname: string;
  networkMode: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const current = context.branches.find((b) => b.is_current);
  const label = networkMode ? "Уся мережа" : current?.tenant_name ?? "Філія";
  return (
    <div className={`navdd branch-sw${networkMode ? " is-network" : ""}${open ? " open" : ""}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        title={networkMode ? "Ви переглядаєте всю мережу" : `Ви у філії «${label}»`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {networkMode ? <IconBuilding className="bs-ic" /> : <IconBranches className="bs-ic" />}
        <span className="bs-name">{label}</span>
        <IconChevron className="chev" />
      </button>
      <div className="dd bs-dd">
        <BranchMenuItems context={context} pathname={pathname} networkMode={networkMode} />
      </div>
    </div>
  );
}
