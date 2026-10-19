import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  IconActivity, IconCalendar, IconClubs, IconPlus, IconStudents, IconTeacher,
} from "../../lib/icons";
import { formatCurrency, formatNumber, etaFromTime, monthShortFromKey } from "../../lib/format";
import type { AuditLog, CalendarEvent, VulnerabilitySummary } from "../../features/dashboard/types";

/* ── KPI ── */
interface KpiProps {
  icon: ReactNode;
  gradient: string;
  shadow: string;
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  /** false — плитка лише показує число й не «підстрибує» при наведенні, як кнопка. */
  interactive?: boolean;
}

/** Скелетон-заглушка на час завантаження. */
export function Sk({ w, h = 16 }: { w: number; h?: number }) {
  return <span className="sk" style={{ display: "inline-block", width: w, height: h }} />;
}
export function KpiTile({ icon, gradient, shadow, label, value, delta, interactive = true }: KpiProps) {
  return (
    <div className={`tile${interactive ? " hov" : ""} t-kpi`}>
      <div className="kpi-icon" style={{ background: gradient, boxShadow: shadow }}>{icon}</div>
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value num">{value}</div>
        <div className="kpi-delta">{delta}</div>
      </div>
    </div>
  );
}

export const KPI_PRESETS = {
  students: {
    icon: <IconStudents />,
    gradient: "linear-gradient(145deg,#e07a50,#a8431f)",
    shadow: "0 6px 14px rgba(205,90,50,.3)",
  },
  teachers: {
    icon: <IconTeacher />,
    gradient: "linear-gradient(145deg,#94a85c,#5c7029)",
    shadow: "0 6px 14px rgba(122,140,67,.3)",
  },
  clubs: {
    icon: <IconClubs />,
    gradient: "linear-gradient(145deg,#dca33c,#a06a12)",
    shadow: "0 6px 14px rgba(196,134,28,.3)",
  },
  lessons: {
    icon: <IconCalendar />,
    gradient: "linear-gradient(145deg,#6585a8,#3a536f)",
    shadow: "0 6px 14px rgba(72,100,138,.3)",
  },
};

/* ── Today schedule ── */
export function TodaySchedule({ events }: { events: CalendarEvent[] }) {
  const upcoming = [...events].sort((a, b) => a.start_time.localeCompare(b.start_time));
  return (
    <div className="tile hov t-today">
      <div className="tile-head">
        <h3>Сьогодні в розкладі</h3>
        <span className="chip">{events.length} занять</span>
      </div>
      {upcoming.length === 0 && <div className="empty-inline">Сьогодні занять немає</div>}
      {upcoming.slice(0, 5).map((ev) => {
        const eta = etaFromTime(ev.start_time);
        const room = ev.teacher_name && ev.teacher_name !== "Невідомий вчитель" ? ev.teacher_name : "";
        return (
          <div className="today-row" key={ev.id}>
            <span className="today-time">{ev.start_time}</span>
            <div>
              <div className="today-t">{ev.club_name}</div>
              <div className="today-s">{room}</div>
            </div>
            {eta && <span className={`today-eta${eta.soon ? " soon" : ""}`}>{eta.label}</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ── Payroll ── */
export function PayrollTile({ months }: { months: { month: string; total: number }[] }) {
  const series = months.slice(-6);
  const last = series.length ? series[series.length - 1] : null;
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const deltaPct =
    last && prev && prev.total > 0 ? ((last.total - prev.total) / prev.total) * 100 : null;

  const max = Math.max(1, ...series.map((m) => m.total));
  const barW = 34;
  const gap = 12;
  const chartH = 64;
  const totalW = series.length * barW + (series.length - 1) * gap;

  return (
    <div className="tile t-money">
      <div>
        <div className="label">Фонд зарплат · {last ? monthShortFromKey(last.month).toLowerCase() : "—"}</div>
        <div className="val num tnum">
          {last ? formatCurrency(last.total) : "0"} <span className="hi">грн</span>
        </div>
        <div className="delta">
          {deltaPct === null
            ? "немає даних за минулий місяць"
            : `${deltaPct >= 0 ? "↗ +" : "↘ "}${deltaPct.toFixed(1)}% до попереднього`}
        </div>
      </div>
      <svg viewBox={`0 0 ${Math.max(totalW, 1)} ${chartH + 14}`} width="100%" height={chartH + 14} role="img" aria-label="Зарплати по місяцях">
        {series.map((m, i) => {
          const h = Math.max(6, (m.total / max) * chartH);
          const x = i * (barW + gap);
          const isLast = i === series.length - 1;
          return (
            <g key={m.month}>
              <rect x={x} y={chartH - h} width={barW} height={h} rx="5" fill={isLast ? "#f0a276" : "#423a2e"} />
              <text
                x={x + barW / 2}
                y={chartH + 12}
                textAnchor="middle"
                fontSize="9.5"
                fontFamily="Commissioner"
                fontWeight={isLast ? 700 : 400}
                fill={isLast ? "#f0a276" : "#948a78"}
              >
                {monthShortFromKey(m.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Top clubs ── */
export function TopClubs({ labels, data }: { labels: string[]; data: number[] }) {
  const rows = labels
    .map((label, i) => ({ label, value: data[i] ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const max = Math.max(1, ...rows.map((r) => r.value));

  // Середня наповнюваність гуртка — як у legacy-аналітиці (записи / активні гуртки)
  const activeClubs = data.filter((v) => v > 0).length;
  const totalEnrollments = data.reduce((a, b) => a + b, 0);
  const avgFill = activeClubs > 0 ? totalEnrollments / activeClubs : null;

  return (
    <div className="tile t-clubs">
      <div className="tile-head">
        <h3>Топ гуртків</h3>
        <span className="chip">
          {avgFill !== null ? `сер. наповнюваність ${avgFill.toFixed(1)}` : "за записами"}
        </span>
      </div>
      {rows.length === 0 && <div className="empty-inline">Немає записів</div>}
      {rows.map((r, i) => (
        <div className="prog-row" key={r.label}>
          <div className="prog-head">
            <b>{r.label}</b>
            <span>{formatNumber(r.value)}</span>
          </div>
          <div className="prog-track">
            <div
              className={`prog-fill${i === 0 ? " hi" : ""}`}
              style={{ width: `${Math.max(4, (r.value / max) * 100).toFixed(0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Динаміка зарплат (legacy-віджет «Динаміка зарплат») ── */
export function SalaryTrendTile({ labels, data }: { labels: string[]; data: number[] }) {
  const n = data.length;
  const last = n ? data[n - 1] : null;
  const prev = n > 1 ? data[n - 2] : null;
  const avg3 = n ? data.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, n) : null;
  const deltaPct = last !== null && prev !== null && prev > 0 ? ((last - prev) / prev) * 100 : null;

  // Геометрія: viewBox 760×170, графік між y=15 та y=130
  const X0 = 30, X1 = 730, Y_TOP = 18, Y_BOTTOM = 130;
  const max = Math.max(1, ...data);
  const step = n > 1 ? (X1 - X0) / (n - 1) : 0;
  const xs = data.map((_, i) => X0 + i * step);
  const ys = data.map((v) => Y_BOTTOM - (v / max) * (Y_BOTTOM - Y_TOP));
  const pts = xs.map((x, i) => `${x.toFixed(0)} ${ys[i].toFixed(0)}`);

  return (
    <div className="tile t-salary">
      <div className="tile-head">
        <h3>Динаміка зарплат</h3>
        <span className="chip">{n ? `останні ${n} міс.` : ""}</span>
      </div>
      <div className="sub">
        {last !== null ? (
          <>
            Останній місяць: <b>{formatCurrency(last)} грн</b>
            {deltaPct !== null && ` · ${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}% до попереднього`}
            {avg3 !== null && ` · середнє за 3 міс: ${formatCurrency(avg3)} грн`}
          </>
        ) : (
          "Поки немає нарахувань"
        )}
      </div>
      {n > 0 && (
        <svg className="chart" viewBox="0 0 760 170" width="100%" height="150" preserveAspectRatio="none" role="img" aria-label="Графік зарплат по місяцях">
          <defs>
            <linearGradient id="gsal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#cd5a32" stopOpacity=".16" />
              <stop offset="1" stopColor="#cd5a32" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g stroke="#f0e9dc">
            {[Y_TOP, 56, 94, Y_BOTTOM].map((y) => <line key={y} x1="14" y1={y} x2="746" y2={y} />)}
          </g>
          <path d={`M${pts.join(" L")} L${xs[n - 1].toFixed(0)} ${Y_BOTTOM} L${xs[0].toFixed(0)} ${Y_BOTTOM} Z`} fill="url(#gsal)" />
          <path d={`M${pts.join(" L")}`} fill="none" stroke="var(--terra)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <g fill="#fffcf7" stroke="var(--terra)" strokeWidth="2">
            {xs.slice(0, -1).map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="4" />)}
          </g>
          <circle cx={xs[n - 1]} cy={ys[n - 1]} r="5.5" fill="var(--terra)" stroke="#fffcf7" strokeWidth="2" />
          <g fontSize="11" fill="#a4998a" textAnchor="middle" fontFamily="Commissioner">
            {labels.map((lbl, i) => {
              const [mm, yyyy] = lbl.split("/");
              return <text key={i} x={xs[i]} y="160">{monthShortFromKey(`${yyyy}-${mm}`)}</text>;
            })}
          </g>
        </svg>
      )}
    </div>
  );
}

/* ── Соціальний профіль: критерії вразливості закладу ── */
export function SocialProfileTile({ data }: { data?: VulnerabilitySummary }) {
  const total = data?.students_total ?? 0;
  const withCriteria = data ? data.with_criteria : null;
  const sharePct = withCriteria !== null && total > 0 ? (withCriteria / total) * 100 : null;

  const rows = (data?.items ?? [])
    .map((item) => ({ label: item.name, value: item.count }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="tile t-social">
      <div className="tile-head">
        <h3>Соціальний профіль</h3>
        <span className="chip">критерії вразливості</span>
      </div>
      <div className="social-head">
        <b>Учні з критеріями</b>
        <span>
          {withCriteria !== null
            ? `${formatNumber(withCriteria)} з ${formatNumber(total)}${sharePct !== null ? ` · ${sharePct.toFixed(0)}%` : ""}`
            : "—"}
        </span>
      </div>
      <div className="prog-track" style={{ marginBottom: 14 }}>
        <div className="prog-fill hi" style={{ width: `${Math.max(sharePct ?? 0, 3).toFixed(0)}%` }} />
      </div>
      {rows.length === 0 && <div className="empty-inline">Ще нікого не позначено — критерії задаються в «Налаштування → Інше»</div>}
      {rows.map((r) => (
        <div className="prog-row" key={r.label}>
          <div className="prog-head">
            <b>{r.label}</b>
            <span>{formatNumber(r.value)}</span>
          </div>
          <div className="prog-track">
            <div className="prog-fill" style={{ width: `${Math.max(6, (r.value / max) * 100).toFixed(0)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Recent actions ── */
const ACTION_TAG: Record<string, { cls: string; label: string }> = {
  CREATE: { cls: "create", label: "Створено" },
  UPDATE: { cls: "update", label: "Оновлено" },
  DELETE: { cls: "delete", label: "Видалено" },
  ENROLL: { cls: "enroll", label: "Запис" },
  UNENROLL: { cls: "enroll", label: "Відпис" },
};
function actionTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function RecentActions({ logs }: { logs: AuditLog[] }) {
  return (
    <div className="tile t-actions">
      <div className="tile-head">
        <h3>Останні дії</h3>
        <Link className="link" to="/audit">Вся історія →</Link>
      </div>
      {logs.length === 0 && <div className="empty-inline">Поки немає записів про дії</div>}
      {logs.slice(0, 5).map((log) => {
        const tag = ACTION_TAG[log.action_type] ?? { cls: "update", label: log.action_type };
        const text = log.entity_name || log.description || log.entity_type;
        return (
          <div className="action-row" key={log.id}>
            <span className={`tag ${tag.cls}`}>{tag.label}</span>
            <div>
              <div className="action-text">{text}</div>
              <div className="action-meta">{log.user_name || "Система"}</div>
            </div>
            <span className="action-time">{actionTime(log.timestamp)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Quick actions ── */
export function QuickActions() {
  const items = [
    { label: "Додати нового учня", href: "/students?new=1", icon: <IconPlus /> },
    { label: "Додати вчителя", href: "/teachers?new=1", icon: <IconTeacher /> },
    { label: "Створити гурток", href: "/clubs?new=1", icon: <IconClubs /> },
    { label: "Сформувати звіт", href: "/statistics", icon: <IconActivity /> },
  ];
  return (
    <div className="tile t-quick">
      <div className="tile-head"><h3>Швидкі дії</h3></div>
      {items.map((it) => (
        <Link className="quick" to={it.href} key={it.label}>{it.icon}{it.label}</Link>
      ))}
    </div>
  );
}

