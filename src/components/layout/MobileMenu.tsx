import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconBranches, IconHome, IconLogout } from "../../lib/icons";
import { buildNavGroups, toneToStyle, type NavCounts } from "./navConfig";

interface Props {
  open: boolean;
  counts: NavCounts;
  isOwner: boolean;
  hasNetworkAccess: boolean;
  role?: "owner" | "admin" | "teacher" | undefined;
  onLogout: () => void;
  /** «Уся мережа»: розділи однієї філії ховаємо — вони працювали б із прихованою філією сесії. */
  networkMode?: boolean;
  /** Групу «Філії» замінює «Уся мережа» в списку філій (власник із ≥2 філіями). */
  hideNetworkGroup?: boolean;
  /** Філії власника — першими: на телефоні це головний спосіб перемкнутися. */
  branchItems?: ReactNode;
}

export function MobileMenu({ open, counts, isOwner, hasNetworkAccess, role, onLogout, networkMode = false, hideNetworkGroup = false, branchItems }: Props) {
  const groups = networkMode ? [] : buildNavGroups(counts, isOwner, hasNetworkAccess, role).filter((g) => !(hideNetworkGroup && g.network));
  return (
    <div className={`mobilemenu${open ? " open" : ""}`} id="mobileMenu">
      {branchItems}
      {/* На телефоні меню посередині шапки сховане — «Філії й оплата» мережі живуть тут. */}
      {networkMode && (
        <>
          <div className="mm-group">Мережа</div>
          <Link className="dd-item" to="/branches">
            <span className="dd-ic" style={toneToStyle("terra")}><IconBranches /></span>
            <span><span className="dd-t">Філії й оплата</span></span>
          </Link>
        </>
      )}
      {!networkMode && (
        <>
          <div className="mm-group">Основне</div>
          <Link className="dd-item" to="/">
            <span className="dd-ic" style={toneToStyle("terra")}><IconHome /></span>
            <span><span className="dd-t">Головна</span></span>
          </Link>
        </>
      )}
      {groups.map((group) => (
        <div key={group.label}>
          <div className="mm-group">{group.label}</div>
          {group.items.map((leaf) => (
            leaf.href.startsWith("/admin") ? (
              <a className="dd-item" href={leaf.href} key={leaf.title}>
                <span className="dd-ic" style={toneToStyle(leaf.tone)}>{leaf.icon}</span>
                <span>
                  <span className="dd-t">{leaf.title}</span>
                  {leaf.sub && (
                    <>
                      <br />
                      <span className="dd-s">{leaf.sub}</span>
                    </>
                  )}
                </span>
              </a>
            ) : (
              <Link className="dd-item" to={leaf.href} key={leaf.title}>
                <span className="dd-ic" style={toneToStyle(leaf.tone)}>{leaf.icon}</span>
                <span>
                  <span className="dd-t">{leaf.title}</span>
                  {leaf.sub && (
                    <>
                      <br />
                      <span className="dd-s">{leaf.sub}</span>
                    </>
                  )}
                </span>
              </Link>
            )
          ))}
        </div>
      ))}
      <div className="mm-group">Акаунт</div>
      <button className="dd-item dd-danger" onClick={onLogout} style={{ width: "100%" }}>
        <span className="dd-ic" style={{ background: "var(--crimson-soft)", color: "var(--crimson)" }}>
          <IconLogout />
        </span>
        <span><span className="dd-t">Вийти</span></span>
      </button>
    </div>
  );
}
