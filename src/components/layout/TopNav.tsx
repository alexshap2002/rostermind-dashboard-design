import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, logout } from "../../lib/api";
import { roleLabel } from "../../lib/format";
import {
  IconBell, IconBurger, IconChevron, IconLogout, IconPlus, IconSearch,
} from "../../lib/icons";
import { buildNavGroups, toneToStyle, type NavCounts } from "./navConfig";
import { MobileMenu } from "./MobileMenu";
import { SearchPalette } from "./SearchPalette";
import { mainBranchQueries } from "../../features/mainBranch/api";
import {
  BRANCH_SWITCH_KEY, forgetBranchSwitch, networkHomeHref, readBranchSwitch, type BranchSwitchMark,
} from "../../features/branches/api";
import { BranchMenuItems, BranchSwitcher, activeBranches, isNetworkPath } from "./BranchSwitcher";
import {
  WhatNextButton, WhatNextPanel, forgetWhatNextAutoOpen, useWhatNext,
} from "../../features/onboarding/WhatNext";

interface Props {
  counts: NavCounts;
  user?: { full_name: string; role: string; initials: string };
  tenantName?: string;
}

/** Чи відмовив бекенд у доступі до мережі філій у цій сесії.

    Модульна змінна, а не стан: відповідь стосується облікового запису, а не
    компонента, і не має сенсу перепитувати її на кожному переході. Скидається
    перезавантаженням сторінки — тобто після повторного входу. */
let networkProbeDenied = false;

/** Легасі-сторінки (/admin/...) відкриваємо повним переходом, SPA-маршрути — клієнтські. */
const isLegacyHref = (href: string) => href.startsWith("/admin");

export function TopNav({ counts, user, tenantName }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [userOpen, setUserOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  // Філія, у яку перейшли в іншій вкладці: ця вкладка показує стару й може записати не туди.
  const [staleSwitch, setStaleSwitch] = useState<BranchSwitchMark | null>(null);
  // «Ви у філії …» одразу після перемикання (сторінка щойно перезавантажилась).
  const [switchedTo, setSwitchedTo] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const qc = useQueryClient();

  // Роль ще не відома (summary вантажиться або відмовив) — не показуємо
  // привілейоване меню «про всяк випадок». Раніше isOwner було
  // `role !== "admin"`, тож при невідомій ролі малювалося меню власника:
  // вчителю воно блимало на кожному переході, а обліковка без картки
  // лишалася з ним назавжди.
  const isOwner = user?.role === "owner";
  // Запит — це проба можливостей: якщо /api/network/context відповів, у
  // адміністратора є доступ до мережі філій. 403 — нормальна відповідь для
  // закладу без цієї функції, але React Query повторював невдалий запит на
  // кожному переході, і в консолі адміністратора накопичувалося по 403 на
  // кожну сторінку. Одна відмова за сесію — цього досить.
  const network = useQuery({
    ...mainBranchQueries.context(),
    enabled:
      Boolean(user && (user.role === "owner" || user.role === "admin")) && !networkProbeDenied,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (network.error instanceof ApiError && network.error.status === 403) {
      networkProbeDenied = true;
    }
  }, [network.error]);
  const hasNetworkAccess = isOwner || Boolean(network.data);
  const ownerNetwork = isOwner ? network.data : undefined;
  const currentBranch = ownerNetwork?.branches.find((b) => b.is_current);
  const multiBranch = activeBranches(ownerNetwork).length >= 2;
  // Режим «Уся мережа»: у шапці лише сторінки мережі, бо меню філії працювало б із прихованою філією сесії.
  const networkMode = multiBranch && isNetworkPath(pathname);
  // Пошук і створення учня працюють лише з поточною філією — на «Усій мережі» їх немає ніколи.
  const hideBranchTools = networkMode || pathname.startsWith("/main-branch");
  const role = user?.role as "owner" | "admin" | "teacher" | undefined;
  const canManage = role === "owner" || role === "admin";
  const whatNext = useWhatNext(canManage);
  // Група «Філії» дублює «Усю мережу» в перемикачі — при ≥2 філіях її не показуємо (у пошуку ⌘K вона лишається).
  // З однією філією «Усієї мережі» в перемикачі немає, тож «Філії й оплата» лишаються в меню.
  const groups = (role ? buildNavGroups(counts, isOwner, hasNetworkAccess, role) : []).filter((g) => !(multiBranch && g.network));
  // Підсвічуємо групу, що містить поточну SPA-сторінку
  const currentGroup = groups.find((g) => g.items.some((it) => it.href === pathname));

  useEffect(() => {
    const closeAll = () => {
      setOpenIdx(null);
      setUserOpen(false);
      setBranchOpen(false);
    };
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeAll();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
      // ⌘K / Ctrl+K — глобальний пошук
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
        closeAll();
      }
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Зміна маршруту — закрити все меню
  useEffect(() => {
    setOpenIdx(null);
    setUserOpen(false);
    setBranchOpen(false);
    setMobileOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  // Перемкнулися в іншій вкладці — сесія вже інша, а ця вкладка ще показує стару філію.
  const currentTenantId = currentBranch?.tenant_id;
  useEffect(() => {
    if (!currentTenantId) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== BRANCH_SWITCH_KEY) return;
      const mark = readBranchSwitch(localStorage);
      if (mark && mark.tenantId !== currentTenantId) setStaleSwitch(mark);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [currentTenantId]);

  // Щойно перемкнулися в цій вкладці — коротко підтверджуємо, де ми тепер.
  useEffect(() => {
    const mark = readBranchSwitch(sessionStorage);
    if (!mark) return;
    forgetBranchSwitch(sessionStorage);
    if (Date.now() - mark.at > 20_000) return;
    setSwitchedTo(mark.tenantName);
    const timer = window.setTimeout(() => setSwitchedTo(null), 3500);
    return () => window.clearTimeout(timer);
  }, []);

  async function onLogout() {
    await logout();
    forgetWhatNextAutoOpen();
    qc.clear();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <nav className="topnav" ref={rootRef}>
        <button
          className="icon-btn burger"
          aria-label="Меню"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <IconBurger />
        </button>

        {ownerNetwork && (
          <BranchSwitcher
            context={ownerNetwork}
            pathname={pathname}
            networkMode={networkMode}
            open={branchOpen}
            onToggle={() => {
              setOpenIdx(null);
              setUserOpen(false);
              setBranchOpen((v) => !v);
            }}
          />
        )}

        <div className="nav">
          {networkMode ? (
            <>
              <Link className={pathname.startsWith("/main-branch") ? "active" : ""} to={networkHomeHref()}>Огляд</Link>
              <Link className={pathname.startsWith("/branches") ? "active" : ""} to="/branches">Філії й оплата</Link>
            </>
          ) : (
          <>
          <Link className={pathname === "/" ? "active" : ""} to="/">Головна</Link>

          {groups.map((group, idx) => (
            <div className={`navdd${openIdx === idx ? " open" : ""}`} key={group.label}>
              <button
                className={currentGroup === group ? "cur" : ""}
                aria-expanded={openIdx === idx}
                aria-haspopup="true"
                onClick={(e) => {
                  e.stopPropagation();
                  setUserOpen(false);
                  setBranchOpen(false);
                  setOpenIdx((cur) => (cur === idx ? null : idx));
                }}
              >
                {group.label}
                {group.badge && <span className="bdg">{group.badge}</span>}
                <IconChevron className="chev" />
              </button>
              <div className="dd">
                {group.items.map((leaf, i) => (
                  <span key={leaf.title}>
                    {/* розділювач перед службовими пунктами */}
                    {((group.label === "Дані" && leaf.title === "Користувачі") ||
                      (group.label === "Аналітика" && leaf.title === "Історія змін") ||
                      (group.label === "Налаштування" && leaf.title === "Інше")) &&
                      i > 0 && <div className="dd-sep" />}
                    {isLegacyHref(leaf.href) ? (
                      <a className="dd-item" href={leaf.href}>
                        <span className="dd-ic" style={toneToStyle(leaf.tone)}>{leaf.icon}</span>
                        <span>
                          <span className="dd-t">{leaf.title}</span>
                          <br />
                          <span className="dd-s">{leaf.sub}</span>
                        </span>
                      </a>
                    ) : (
                      <Link className="dd-item" to={leaf.href} onClick={() => setOpenIdx(null)}>
                        <span className="dd-ic" style={toneToStyle(leaf.tone)}>{leaf.icon}</span>
                        <span>
                          <span className="dd-t">{leaf.title}</span>
                          <br />
                          <span className="dd-s">{leaf.sub}</span>
                        </span>
                      </Link>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
          </>
          )}
        </div>

        {/* На «Усій мережі» пошук і створення учня працювали б із прихованою філією сесії. */}
        {!hideBranchTools && <div
          className="gsearch"
          role="button"
          tabIndex={0}
          aria-label="Глобальний пошук"
          onClick={() => setSearchOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSearchOpen(true);
            }
          }}
        >
          <IconSearch />
          <span className="ph">Пошук: учні, вчителі, гуртки…</span>
          <span className="kbd">⌘K</span>
        </div>}

        <div className="topnav-right">
          {/* «Що далі?» і сповіщення — налаштування однієї філії, у режимі мережі їх немає. */}
          {canManage && !networkMode && <WhatNextButton state={whatNext} />}
          {!networkMode && (
            <Link
              className="icon-btn"
              to={canManage ? "/telegram-notifications" : "/my-notifications"}
              aria-label="Налаштування сповіщень"
            >
              <IconBell />
            </Link>
          )}
          {canManage && !hideBranchTools && (
            <Link className="btn" to="/students?new=1">
              <IconPlus />
              <span>Додати учня</span>
            </Link>
          )}

          <div className={`navdd${userOpen ? " open" : ""}`}>
            <button
              className="avatar avatar-btn"
              aria-label="Меню користувача"
              aria-expanded={userOpen}
              aria-haspopup="true"
              onClick={(e) => {
                e.stopPropagation();
                setOpenIdx(null);
                setBranchOpen(false);
                setUserOpen((v) => !v);
              }}
            >
              {user?.initials ?? "··"}
            </button>
            <div className="dd dd-right">
              <div className="dd-user">
                <div className="dd-t">{user?.full_name ?? "—"}</div>
                <div className="dd-s">
                  {networkMode ? "Власник мережі" : <>{user ? roleLabel(user.role) : ""}{tenantName ? ` · ${tenantName}` : ""}</>}
                </div>
              </div>
              <div className="dd-sep" />
              <button className="dd-item dd-danger" onClick={onLogout}>
                <span className="dd-ic" style={{ background: "var(--crimson-soft)", color: "var(--crimson)" }}>
                  <IconLogout />
                </span>
                <span>
                  <span className="dd-t">Вийти</span>
                  <br />
                  <span className="dd-s">Завершити сесію</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {multiBranch && currentBranch && !networkMode && (
        <div className="ctx-strip">
          <span>Ви у філії <b>{currentBranch.tenant_name}</b></span>
          <Link to={networkHomeHref(true)}>← Уся мережа</Link>
        </div>
      )}
      {staleSwitch && (
        <div className="stale-banner" role="alert">
          <span>
            В іншій вкладці ви перейшли у філію «{staleSwitch.tenantName}». Ця вкладка показує стару філію —
            оновіть її, щоб не змінити дані не тієї філії.
          </span>
          <button type="button" className="btn" onClick={() => window.location.reload()}>Оновити</button>
        </div>
      )}
      {switchedTo && (
        <div className="switch-toast" role="status">Ви у філії «{switchedTo}»</div>
      )}

      <MobileMenu
        open={mobileOpen}
        counts={counts}
        isOwner={isOwner}
        hasNetworkAccess={hasNetworkAccess}
        role={role}
        onLogout={onLogout}
        networkMode={networkMode}
        hideNetworkGroup={multiBranch}
        branchItems={ownerNetwork ? <BranchMenuItems context={ownerNetwork} pathname={pathname} networkMode={networkMode} /> : undefined}
      />
      <SearchPalette open={searchOpen && !hideBranchTools} isOwner={isOwner} hasNetworkAccess={hasNetworkAccess} role={role} onClose={() => setSearchOpen(false)} />
      {canManage && whatNext.open && <WhatNextPanel state={whatNext} />}
    </>
  );
}
