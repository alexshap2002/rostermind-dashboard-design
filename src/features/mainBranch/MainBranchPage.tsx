import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { AccessProblem, EmptyState } from "../../components/admin/primitives";
import { TopNav } from "../../components/layout/TopNav";
import { dashboardQueries } from "../dashboard/api";
import { enterBranch, rememberNetworkUrl } from "../branches/api";
import { ApiError, apiDownload } from "../../lib/api";
import {
  formatCurrency, formatDayMonth, formatNumber, formatPercent, formatRangeShort, formatUpdatedAt, pluralUk,
} from "../../lib/format";
import { IconActivity, IconCheckSquare, IconMoney, IconStudents } from "../../lib/icons";
import { DEMO } from "../../demo/mockApi";
import {
  ANOMALY_LABELS, SEVERITY, UNMARKED_LESSON, mainBranchExportUrl, mainBranchQueries,
  type AttentionItem, type BranchRow, type MainBranchFilters, type MainBranchKpi,
} from "./api";
import { BranchCompare } from "./BranchCompare";
import { Delta, PANEL_KINDS, branchSignals, countLessons, type Panel, type PanelKind } from "./metrics";
import { MetricPanel } from "./MetricPanel";
import { NeonNav, type PresetItem, type Section } from "./NeonNav";
import { NowStrip } from "./NowStrip";
import { ReportTabs, TABS, type Tab } from "./ReportTabs";
import { TrendPanel, type TrendPoint } from "./TrendPanel";

/* ── Дати за Києвом ── */

const KYIV_PARTS = new Intl.DateTimeFormat("en", {
  timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit",
});
function kyivToday(): Date {
  const parts = Object.fromEntries(KYIV_PARTS.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12));
}
function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function monthStart(d: Date): Date { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12)); }
function monthEnd(d: Date): Date { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)); }
const utc = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`);
const WEEKDAY = new Intl.DateTimeFormat("uk-UA", { weekday: "short", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", timeZone: "UTC" });
const MONTH_ONLY = new Intl.DateTimeFormat("uk-UA", { month: "long", timeZone: "UTC" });
/** «Порівнюємо з серпнем» — орудний відмінок місяця. */
const MONTH_WITH = ["січнем", "лютим", "березнем", "квітнем", "травнем", "червнем", "липнем", "серпнем", "вереснем", "жовтнем", "листопадом", "груднем"];
/** «Зараз» — відкриті справи за останні 30 днів, незалежно від обраного періоду. */
const NOW_DAYS = 30;

function isFullMonth(from: string, to: string): boolean {
  const f = utc(from);
  const t = utc(to);
  return f.getUTCDate() === 1 && f.getUTCMonth() === t.getUTCMonth() && f.getUTCFullYear() === t.getUTCFullYear() && addDays(t, 1).getUTCDate() === 1;
}

/** Справжні дати замість назви пресету: «1–3 жовтня», «29 вересня – 3 жовтня», «вересень 2026». */
function humanRange(from: string, to: string): string {
  if (isFullMonth(from, to)) return MONTH.format(utc(from)).replace(/\s*р\.$/, "");
  const f = utc(from);
  const t = utc(to);
  const year = (d: Date) => (d.getUTCFullYear() !== kyivToday().getUTCFullYear() ? ` ${d.getUTCFullYear()}` : "");
  if (from === to) return `${DAY_MONTH.format(f)}${year(f)}`;
  if (f.getUTCMonth() === t.getUTCMonth() && f.getUTCFullYear() === t.getUTCFullYear()) return `${f.getUTCDate()}–${DAY_MONTH.format(t)}${year(t)}`;
  return `${DAY_MONTH.format(f)}${year(f)} – ${DAY_MONTH.format(t)}${year(t)}`;
}

/** Що з чим порівнюємо — словами, щоб «−2 в.п.» не виглядали загадкою. */
function compareText(comparison: MainBranchKpi["comparison"], filters: MainBranchFilters): string {
  const cur = comparison.current_period;
  const prev = comparison.previous_period;
  if (!cur || !prev) return "Сьогоднішній день ще триває — порівняємо завтра";
  if (isFullMonth(cur.date_from, cur.date_to) && isFullMonth(prev.date_from, prev.date_to)) {
    return `Порівнюємо з ${MONTH_WITH[utc(prev.date_from).getUTCMonth()]} ${utc(prev.date_from).getUTCFullYear()}`;
  }
  const span = Math.round((utc(cur.date_to).getTime() - utc(cur.date_from).getTime()) / 86_400_000) + 1;
  const notes = [
    span < 28 ? "ті самі дні тижня" : null,
    cur.date_to.slice(0, 10) !== filters.dateTo ? "без сьогодні — день ще триває" : null,
  ].filter(Boolean);
  return `Порівнюємо ${formatRangeShort(cur.date_from, cur.date_to)} з ${formatRangeShort(prev.date_from, prev.date_to)}${notes.length ? ` (${notes.join(", ")})` : ""}`;
}

type Preset = "today" | "week" | "month" | "prev" | "custom";
const PRESETS: { key: Exclude<Preset, "custom">; label: string }[] = [
  { key: "today", label: "Сьогодні" },
  { key: "week", label: "Цей тиждень" },
  { key: "month", label: "Цей місяць" },
  { key: "prev", label: "Минулий місяць" },
];

/** Пресети закінчуються сьогодні: «цей місяць» на 3-тє — це 1–3 число, а не весь місяць наперед. */
function presetRange(p: Exclude<Preset, "custom">): { dateFrom: string; dateTo: string } {
  const today = kyivToday();
  if (p === "today") return { dateFrom: iso(today), dateTo: iso(today) };
  if (p === "week") return { dateFrom: iso(addDays(today, -((today.getUTCDay() + 6) % 7))), dateTo: iso(today) };
  if (p === "month") return { dateFrom: iso(monthStart(today)), dateTo: iso(today) };
  const prev = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1, 12));
  return { dateFrom: iso(monthStart(prev)), dateTo: iso(monthEnd(prev)) };
}
function presetOf(f: MainBranchFilters): Preset {
  return PRESETS.find((p) => {
    const r = presetRange(p.key);
    return r.dateFrom === f.dateFrom && r.dateTo === f.dateTo;
  })?.key ?? "custom";
}

const TAB_KEYS = TABS.map((t) => t.key);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readPanel(params: URLSearchParams): Panel | null {
  const kind = params.get("panel") as PanelKind | null;
  if (!kind || !PANEL_KINDS.includes(kind)) return null;
  const branch = Number(params.get("panel_branch"));
  return { kind, branch: Number.isSafeInteger(branch) && branch > 0 ? branch : null, scope: params.get("panel_scope") === "now" ? "now" : "period" };
}

function readUrl(): { filters: MainBranchFilters; tab: Tab | null; fresh: boolean; panel: Panel | null } {
  const params = new URLSearchParams(window.location.search);
  const fallback = presetRange("month");
  const dateFrom = params.get("date_from");
  const dateTo = params.get("date_to");
  const tab = params.get("tab") as Tab | null;
  return {
    filters: {
      dateFrom: dateFrom && DATE_RE.test(dateFrom) ? dateFrom : fallback.dateFrom,
      dateTo: dateTo && DATE_RE.test(dateTo) ? dateTo : fallback.dateTo,
      branchIds: [...new Set(params.getAll("branch_ids").map(Number).filter((v) => Number.isSafeInteger(v) && v > 0))],
      // «← Уся мережа» з філії: дані могли змінитися — оминаємо 5-хвилинний кеш.
      refresh: params.get("fresh") === "1",
    },
    tab: tab && TAB_KEYS.includes(tab) ? tab : null,
    fresh: params.get("fresh") === "1",
    panel: readPanel(params),
  };
}

/** Старі адреси дій з бекенду (/admin/...) → сторінки нової адмінки. */
function spaActionUrl(url: string | null): string {
  if (!url) return "/main-branch";
  const replacements: Record<string, string> = {
    "/admin/conducted_lessons": "/conducted-lessons",
    "/admin/main-branch": "/main-branch",
    "/admin/branches": "/branches",
    "/admin/students": "/students",
    "/admin/payroll": "/payroll",
    "/admin/lesson_statistics": "/lesson-statistics",
  };
  const [path, query] = url.split("?", 2);
  if (path === "/admin/lesson_statistics" && query) {
    const lessonId = new URLSearchParams(query).get("lesson_id");
    if (lessonId && /^\d+$/.test(lessonId)) return `/conducted-lessons?edit=${lessonId}`;
  }
  const target = replacements[path] ?? path.replace(/^\/admin/, "");
  return query ? `${target}?${query}` : target;
}

const SECTION_IDS: Record<Section, string> = { top: "nd-top", branches: "nd-branches", reports: "nd-reports" };

/** Прокрутити до розділу; липка шапка врахована через scroll-margin-top у стилях. */
function scrollToSection(section: Section) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(SECTION_IDS[section])?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/** Каркас сторінки: шапка + широкий контент без стандартного заголовка — заголовок малює сама консоль.
    Логіка 401/403 — як у PageShell. */
function NeonShell({ children }: { children: ReactNode }) {
  const summary = useQuery(dashboardQueries.summary());
  const s = summary.data;
  const counts = s
    ? { students: s.stats.students, teachers: s.stats.teachers, clubs: s.stats.clubs, active_schedules: s.stats.active_schedules }
    : {};
  if (summary.error instanceof ApiError && summary.error.status === 401) return <Navigate to="/login" replace />;
  if (summary.error instanceof ApiError && summary.error.status === 403) return <AccessProblem error={summary.error} />;
  return (
    <>
      <TopNav counts={counts} user={s?.user} tenantName={s?.tenant.name} />
      <div className="content wide">{children}</div>
    </>
  );
}

export function MainBranchPage() {
  const qc = useQueryClient();
  const initial = useMemo(readUrl, []);
  const network = useQuery(mainBranchQueries.context());
  const [filters, setFilters] = useState<MainBranchFilters>(initial.filters);
  const [tab, setTab] = useState<Tab>(initial.tab ?? "lessons");
  const [reportsOpen, setReportsOpen] = useState(initial.tab !== null);
  const [section, setSection] = useState<Section>("top");
  const [panel, setPanelState] = useState<Panel | null>(initial.panel);
  const [problemFilter, setProblemFilter] = useState<{ severity?: string; type?: string; cursor: number }>({ cursor: 0 });
  const [trendMode, setTrendMode] = useState<"daily" | "weekly" | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const preset: Preset = customOpen ? "custom" : presetOf(filters);
  const setPanel = useCallback((next: Panel | null) => setPanelState(next), []);

  // Темна тема «Неон» — лише на цій сторінці: клас на body перевизначає токени для всього, що тут рендериться.
  useEffect(() => {
    document.body.classList.add("theme-neon");
    return () => document.body.classList.remove("theme-neon");
  }, []);

  // Стан сторінки (період, філії, вкладка, відкрита панель) живе в адресі: «Назад до мережі» повертає сюди ж.
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("date_from", filters.dateFrom);
    params.set("date_to", filters.dateTo);
    for (const id of filters.branchIds) params.append("branch_ids", String(id));
    params.set("tab", tab);
    if (panel) {
      params.set("panel", panel.kind);
      if (panel.branch !== null) params.set("panel_branch", String(panel.branch));
      if (panel.scope === "now") params.set("panel_scope", "now");
    }
    const url = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", url);
    rememberNetworkUrl(url);
  }, [filters.branchIds, filters.dateFrom, filters.dateTo, tab, panel]);

  const datasets = useMemo(() => new Set(network.data?.capabilities.datasets ?? []), [network.data]);
  const enabled = (dataset: string) => Boolean(network.data && datasets.has(dataset));
  const visibleTabs = useMemo(() => TABS.filter((t) => datasets.has(t.dataset)), [datasets]);

  const today = iso(kyivToday());
  const todayFilters: MainBranchFilters = { dateFrom: today, dateTo: today, branchIds: [], refresh: filters.refresh };
  const nowFilters: MainBranchFilters = { dateFrom: iso(addDays(kyivToday(), -(NOW_DAYS - 1))), dateTo: today, branchIds: [], refresh: filters.refresh };
  const allFilters: MainBranchFilters = { ...filters, branchIds: [] };

  const kpi = useQuery({ ...mainBranchQueries.kpi(filters), enabled: enabled("kpi") });
  // Той самий період без фільтра філій — для лічильників у навігації (при порожньому фільтрі це той самий кеш).
  const kpiAll = useQuery({ ...mainBranchQueries.kpi(allFilters), enabled: enabled("kpi") });
  const trends = useQuery({ ...mainBranchQueries.trends(filters), enabled: enabled("trends") });
  const periodAttention = useQuery({ ...mainBranchQueries.attention(filters), enabled: enabled("attention") });
  const attention = useQuery({ ...mainBranchQueries.attention(nowFilters), enabled: enabled("attention") });
  const todayKpi = useQuery({ ...mainBranchQueries.kpi(todayFilters), enabled: enabled("kpi") });
  const unmarked = useQuery({ ...mainBranchQueries.anomalies(nowFilters, 0, 100, { type: UNMARKED_LESSON }), enabled: enabled("anomalies") });

  const activeBranches = (network.data?.branches ?? []).filter((b) => b.lifecycle_status === "active");
  const pendingCount = (network.data?.branches ?? []).filter((b) => b.lifecycle_status === "onboarding").length;
  const currentTenantId = network.data?.branches.find((b) => b.is_current)?.tenant_id;
  const canEnter = Boolean(network.data?.capabilities.can_switch_branch);
  const k = kpi.data;
  const span = Math.round((Date.parse(filters.dateTo) - Date.parse(filters.dateFrom)) / 86_400_000) + 1;
  const mode = trendMode ?? (span <= 45 ? "daily" : "weekly");

  const setRange = (range: { dateFrom: string; dateTo: string }) => setFilters((f) => ({ ...f, ...range, refresh: false }));
  const toggleBranch = (id: number) =>
    setFilters((f) => ({ ...f, refresh: false, branchIds: f.branchIds.includes(id) ? f.branchIds.filter((x) => x !== id) : [...f.branchIds, id] }));
  const onRefresh = () => {
    setFilters((f) => ({ ...f, refresh: true }));
    qc.invalidateQueries({ queryKey: ["main-branch"] });
  };

  /** «Працювати у філії»: змінює робочий контекст (сесію) і відкриває сторінку філії. */
  async function goToBranch(tenantId: number, tenantName: string, path: string, what = "Працювати у філії") {
    if (DEMO) {
      setNotice(`Демо: тут програма перемкне вас у філію «${tenantName}» і відкриє «${what.replace(/ філії$/, "")}». У демо-версії переходу немає.`);
      return;
    }
    if (tenantId === currentTenantId) {
      window.location.assign(path);
      return;
    }
    setBusyId(tenantId);
    setNotice(null);
    try {
      await enterBranch(tenantId, tenantName, path);
    } catch (err) {
      setBusyId(null);
      setNotice(err instanceof ApiError ? err.message : "Не вдалося перейти у філію. Спробуйте ще раз.");
    }
  }

  const points: TrendPoint[] = useMemo(() => {
    const series = trends.data?.series;
    if (!series) return [];
    if (mode === "daily") {
      return series.daily.map((d) => ({
        label: formatDayMonth(d.date),
        title: `${WEEKDAY.format(utc(d.date))}, ${formatDayMonth(d.date)}`,
        rate: d.attendance_rate_pct === null ? null : Number(d.attendance_rate_pct),
        lessons: d.lessons, present: d.present_students, expected: d.total_students,
      }));
    }
    return series.weekly.map((w) => ({
      label: formatRangeShort(w.date_from, w.date_to),
      title: `Тиждень ${formatRangeShort(w.date_from, w.date_to)}`,
      rate: w.attendance_rate_pct === null ? null : Number(w.attendance_rate_pct),
      lessons: w.lessons, present: w.present_students, expected: w.total_students,
    }));
  }, [trends.data, mode]);

  async function downloadReport() {
    if (DEMO) {
      setNotice("Демо: тут завантажиться Excel-звіт мережі за обраний період і філії.");
      return;
    }
    setDownloading(true);
    setNotice(null);
    try {
      await apiDownload(mainBranchExportUrl("full", filters, "xlsx"), "zvit-merezhi.xlsx");
    } catch (err) {
      setNotice(`Звіт не завантажився: ${err instanceof ApiError ? err.message : "спробуйте ще раз"}`);
    } finally {
      setDownloading(false);
    }
  }

  /** Перехід до розділу з навігації; «Проблеми» ще й розгортає звіти на потрібній вкладці. */
  function jump(target: Section, tabKey?: "problems") {
    setSection(target);
    if (target === "reports") {
      setReportsOpen(true);
      if (tabKey) setTab(tabKey);
    }
    // Розгортка може ще не відрендеритись — прокручуємо після кадру.
    window.requestAnimationFrame(() => scrollToSection(target));
  }

  if (network.error instanceof ApiError) {
    return (
      <NeonShell>
        <div className="nd-neon-solo"><h2>Мережа шкіл</h2></div>
        <EmptyState title="Немає доступу до мережі">{network.error.message}</EmptyState>
      </NeonShell>
    );
  }

  const periodLabel = preset === "today" ? "Сьогодні" : cap(humanRange(filters.dateFrom, filters.dateTo));
  const selectedNames = filters.branchIds.map((id) => activeBranches.find((b) => b.tenant_id === id)?.tenant_name).filter(Boolean);
  const branchesLabel = selectedNames.length === 0 || selectedNames.length === activeBranches.length
    ? `Усі філії (${formatNumber(activeBranches.length)})`
    : selectedNames.length === 1 ? String(selectedNames[0]) : `${formatNumber(selectedNames.length)} ${pluralUk(selectedNames.length, "філія", "філії", "філій")}`;
  const noCompare = Boolean(k && !k.comparison.previous_period);
  const attDelta = k?.comparison.attendance_rate_pct?.delta_percentage_points;
  const payDelta = k?.comparison.payroll_total_uah?.delta_percent;
  const failed = [kpi, trends, attention, todayKpi, unmarked].find((q) => q.error instanceof ApiError)?.error as ApiError | undefined;
  const periodItems = periodAttention.data?.items ?? [];
  const open = (kind: PanelKind) => () => setPanel({ kind, branch: null, scope: "period" });
  // Підписи пресетів у навігації — коротко: «20 жовтня», «19–20 жовтня», «вересень» (рік — лише якщо інший).
  const presets: PresetItem[] = PRESETS.map((p) => {
    const r = presetRange(p.key);
    const from = utc(r.dateFrom);
    const range = p.key === "today" ? DAY_MONTH.format(from)
      : p.key === "prev" ? `${MONTH_ONLY.format(from)}${from.getUTCFullYear() !== kyivToday().getUTCFullYear() ? ` ${from.getUTCFullYear()}` : ""}`
      : humanRange(r.dateFrom, r.dateTo);
    return { key: p.key, label: p.label, range };
  });

  return (
    <NeonShell>
      <div className="nd-neon">
        <NeonNav
          section={section}
          onJump={jump}
          onPanel={(kind) => setPanel({ kind, branch: null, scope: "period" })}
          presets={presets}
          preset={preset}
          onPreset={(key) => { setCustomOpen(false); setRange(presetRange(key as Exclude<Preset, "custom">)); }}
          onCustom={() => setCustomOpen(true)}
          filters={filters}
          onRange={setRange}
          branches={activeBranches}
          rowsAll={kpiAll.data?.branch_rows ?? []}
          onToggleBranch={toggleBranch}
          onAllBranches={() => setFilters((f) => ({ ...f, refresh: false, branchIds: [] }))}
          onRefresh={onRefresh}
          canExport={Boolean(network.data?.capabilities.can_export_full_report)}
          exporting={downloading}
          onExport={downloadReport}
        />

        <main className="nd-main" id="nd-top">
          {DEMO && <div className="nd-demo" role="note"><b>Демо-версія</b> · дані вигадані, лише для обговорення дизайну. Зміни й переходи у філії вимкнено.</div>}

          {/* ── А. Контекст ── */}
          <header className="nd-head">
            <div className="nd-head-text">
              <h2>Мережа шкіл</h2>
              <p className="nd-sub">
                {periodLabel} · {branchesLabel}
                {pendingCount > 0 && <> · {pendingCount} {pluralUk(pendingCount, "філія чекає", "філії чекають", "філій чекають")} оплати</>}
                {k && <> · {formatUpdatedAt(k.generated_at)}</>}
              </p>
              {k && <p className="nd-compare">{compareText(k.comparison, filters)}</p>}
            </div>
            <div className="nd-jump" role="group" aria-label="Перейти до розділу">
              <button type="button" className={section === "top" ? "on" : ""} onClick={() => jump("top")}>Огляд</button>
              <button type="button" className={section === "branches" ? "on" : ""} onClick={() => jump("branches")}>Філії</button>
              <button type="button" className={section === "reports" ? "on" : ""} onClick={() => jump("reports")}>Звіти</button>
            </div>
          </header>

          {notice && <div className="nd-notice" role="status">{notice}<button type="button" className="nd-icon-btn" aria-label="Закрити" onClick={() => setNotice(null)}>✕</button></div>}
          {failed && (
            <div className="form-error" role="alert">
              Частину даних не завантажено: {failed.message}{" "}
              <button type="button" className="btn ghost sm" onClick={onRefresh}>Спробувати ще</button>
            </div>
          )}

          {/* ── В. Основні показники за період ── */}
          <div className="nd-kpis">
            <Kpi tone="teal" icon={<IconStudents />} label="Діти в базі" loading={!k} onOpen={open("students")}
              value={k ? formatNumber(k.students_total) : ""}
              sub="поточна база на кінець періоду"
              extra={k && (
                <button type="button" className="nd-kpi-chip" onClick={open("new")}>
                  {k.students_new > 0 ? `+${formatNumber(k.students_new)} нових за період →` : "нових за період немає"}
                </button>
              )} />
            <Kpi tone="violet" icon={<IconCheckSquare />} label="Проведено занять" loading={!k} onOpen={open("lessons")}
              value={k ? <>{formatNumber(k.lessons_completed)}<small> з {formatNumber(k.lessons_scheduled)}</small></> : ""}
              sub="навчальні заняття з відміткою"
              extra={k && (
                <>
                  {k.lessons_unmarked_overdue > 0
                    ? <button type="button" className="nd-kpi-chip" onClick={() => setPanel({ kind: "unmarked", branch: null, scope: "period" })}>{formatNumber(k.lessons_unmarked_overdue)} не відмічено →</button>
                    : <span className="nd-kpi-chip static">усі відмічено</span>}
                  {k.lessons_upcoming > 0 && <span className="nd-kpi-chip static">{formatNumber(k.lessons_upcoming)} попереду</span>}
                </>
              )} />
            <Kpi tone="orange" icon={<IconActivity />} label="Відвідуваність" loading={!k} onOpen={open("attendance")}
              value={k ? (k.attendance_has_data ? formatPercent(k.attendance_rate_pct) : "—") : ""}
              sub={k ? (!k.attendance_has_data ? "занять з дітьми не було" : "присутні з очікуваних дітей") : null}
              delta={k && k.attendance_has_data ? (noCompare ? <small>порівняємо завтра — день ще триває</small>
                : attDelta === null || attDelta === undefined ? <small>немає з чим порівняти</small>
                : <><Delta value={attDelta} unit="pp" /><small>до попереднього періоду</small></>) : null} />
            <Kpi tone="pink" icon={<IconMoney />} label="Нараховано зарплат" loading={!k} onOpen={open("payroll")}
              value={k ? `${formatCurrency(k.payroll_total_uah)} ₴` : ""}
              sub="нарахування за заняття й бонуси"
              delta={k ? (noCompare ? <small>порівняємо завтра — день ще триває</small>
                : payDelta === null || payDelta === undefined ? <small>немає з чим порівняти</small>
                : <><Delta value={payDelta} unit="pct" tone="neutral" /><small>до попереднього періоду</small></>) : null} />
          </div>
          {k && (
            <p className="nd-aux">
              {formatNumber(k.branches_total)} {pluralUk(k.branches_total, "активна філія", "активні філії", "активних філій")}
              {" · "}{formatNumber(k.teachers_total)} {pluralUk(k.teachers_total, "працівник", "працівники", "працівників")}
              {k.lessons_cancelled > 0 && <> · {formatNumber(k.lessons_cancelled)} {pluralUk(k.lessons_cancelled, "заняття скасовано", "заняття скасовано", "занять скасовано")}</>}
            </p>
          )}

          {/* ── Б. На зараз · стан філій · сигнали за період ── */}
          <div className="nd-trio">
            <NowStrip
              today={todayKpi.data}
              unmarked={unmarked.data}
              attention={attention.data}
              days={NOW_DAYS}
              loading={todayKpi.isLoading || unmarked.isLoading || attention.isLoading}
              onOpen={setPanel}
            />
            <BranchStatus rows={k?.branch_rows ?? []} attention={periodItems} loading={kpi.isLoading} onOpen={setPanel} />
            <PeriodSignals items={periodItems} loading={periodAttention.isLoading} onOpen={setPanel} />
          </div>

          {/* ── Г. Філії ── */}
          <section className="nd-card nd-branches" id="nd-branches" aria-labelledby="nd-branches-h">
            <header className="nd-card-head">
              <h3 id="nd-branches-h">Філії</h3>
              <span className="nd-meta">назва — огляд філії тут · число — розбивка показника · «Працювати у філії» — перейти в її роботу</span>
            </header>
            <BranchCompare
              rows={k?.branch_rows ?? []}
              attention={periodItems}
              loading={kpi.isLoading}
              canEnter={canEnter}
              busyId={busyId}
              onOpen={setPanel}
              onEnter={(r) => goToBranch(r.tenant_id, r.tenant_name, "/")}
            />
            {pendingCount > 0 && (
              <p className="nd-aux in-card">{pendingCount} {pluralUk(pendingCount, "філія чекає", "філії чекають", "філій чекають")} оплати RosterMind — <a className="link" href="/branches">Філії й оплата</a></p>
            )}
          </section>

          {/* ── Д. Динаміка ── */}
          <section className="nd-card nd-trend" aria-labelledby="nd-trend-h">
            <header className="nd-card-head">
              <div>
                <h3 id="nd-trend-h">Динаміка за період</h3>
                <span className="nd-meta">{span < 7 ? "для динаміки оберіть щонайменше тиждень" : mode === "daily" ? "по днях" : "по тижнях"}</span>
              </div>
              {span >= 7 && (
                <div className="nd-seg" role="radiogroup" aria-label="Крок графіка">
                  <button type="button" role="radio" aria-checked={mode === "daily"} className={mode === "daily" ? "on" : ""} onClick={() => setTrendMode("daily")}>По днях</button>
                  <button type="button" role="radio" aria-checked={mode === "weekly"} className={mode === "weekly" ? "on" : ""} onClick={() => setTrendMode("weekly")}>По тижнях</button>
                </div>
              )}
            </header>
            {span >= 7 && <TrendPanel points={points} loading={trends.isLoading} />}
          </section>

          {/* ── Детальні звіти ── */}
          <details className="nd-details" id="nd-reports" open={reportsOpen} onToggle={(e) => setReportsOpen(e.currentTarget.open)}>
            <summary><h3>Детальні звіти</h3><span>заняття, гуртки, відвідуваність, зарплати, проблеми — за обраний період</span></summary>
            <ReportTabs
              tab={tab}
              tabs={visibleTabs}
              onTab={setTab}
              filters={filters}
              tenant={null}
              onClearTenant={() => undefined}
              problemFilter={problemFilter}
              onProblemFilter={setProblemFilter}
              canEnter={canEnter}
              busyId={busyId}
              onAction={(row) => goToBranch(row.tenant_id, row.tenant_name, spaActionUrl(row.action_url), "Відкрити")}
            />
          </details>
        </main>
      </div>

      {panel && (
        <MetricPanel
          panel={panel}
          kpi={k}
          todayKpi={todayKpi.data}
          attention={panel.scope === "now" ? attention.data : periodAttention.data}
          filters={filters}
          nowFilters={nowFilters}
          periodLabel={`${periodLabel} · ${branchesLabel}`}
          nowLabel={`На зараз · останні ${NOW_DAYS} днів`}
          canEnter={canEnter}
          busyId={busyId}
          onPanel={setPanel}
          onWork={goToBranch}
        />
      )}
    </NeonShell>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const lower = (s: string) => s[0].toLowerCase() + s.slice(1);

/** Градієнтна картка показника: уся картка — кнопка з видимим «Переглянути»; чипи — окремими кнопками поруч. */
function Kpi({ tone, icon, label, value, sub, delta, extra, loading, onOpen }: {
  tone: "teal" | "violet" | "orange" | "pink"; icon: ReactNode; label: string; value: ReactNode;
  sub?: ReactNode; delta?: ReactNode; extra?: ReactNode; loading: boolean; onOpen: () => void;
}) {
  return (
    <div className={`nd-kpi ${tone}`}>
      <button type="button" className="nd-kpi-main" onClick={onOpen} aria-label={`${label}: переглянути по філіях`}>
        <span className="nd-kpi-top">
          <span className="nd-kpi-ic" aria-hidden="true">{icon}</span>
          <span className="nd-kpi-label">{label}</span>
        </span>
        {loading ? <span className="nd-skel on-color" style={{ width: 120, height: 34 }} /> : <span className="nd-kpi-value">{value}</span>}
        {delta && <span className="nd-kpi-delta">{delta}</span>}
        {sub && <span className="nd-kpi-sub">{sub}</span>}
        <span className="nd-kpi-go">Переглянути по філіях →</span>
      </button>
      {extra && <div className="nd-kpi-extra">{extra}</div>}
    </div>
  );
}

/** Картка «Філії»: стан кожної філії за період одним словом; назва веде в «Огляд філії». */
function BranchStatus({ rows, attention, loading, onOpen }: {
  rows: BranchRow[]; attention: AttentionItem[]; loading: boolean; onOpen: (panel: Panel) => void;
}) {
  return (
    <section className="nd-card nd-list-card" aria-labelledby="nd-bs-title">
      <header className="nd-card-head">
        <h3 id="nd-bs-title">Стан філій</h3>
        <span className="nd-meta">за обраний період</span>
      </header>
      <div className="nd-rows">
        {loading && rows.length === 0 && <><span className="nd-skel" style={{ width: "70%" }} /><span className="nd-skel" style={{ width: "60%" }} /></>}
        {!loading && rows.length === 0 && <div className="nd-empty">У вибраних немає активних філій</div>}
        {rows.map((r) => {
          const signals = branchSignals(r, attention);
          const first = signals[0];
          return (
            <div className="nd-row static" key={r.tenant_id}>
              <button type="button" className="nd-row-name" onClick={() => onOpen({ kind: "branch", branch: r.tenant_id, scope: "period" })}>
                <b>{r.tenant_name}</b><span>Огляд філії →</span>
              </button>
              {first ? (
                <button type="button" className={`nd-pill ${first.tone}`} onClick={() => onOpen({ kind: first.kind, branch: r.tenant_id, scope: "period" })}>
                  {first.text}{signals.length > 1 && ` +${signals.length - 1}`}
                </button>
              ) : (
                <span className="nd-pill ok">усе гаразд</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Картка «Сигнали за період»: невідмічені уроки згорнуто по філіях, решта сигналів — як є; до 5 рядків. */
function PeriodSignals({ items, loading, onOpen }: { items: AttentionItem[]; loading: boolean; onOpen: (panel: Panel) => void }) {
  const byTenant = new Map<number, { name: string; n: number }>();
  const others: AttentionItem[] = [];
  for (const it of items) {
    if (it.anomaly_type === UNMARKED_LESSON) {
      const cur = byTenant.get(it.tenant_id) ?? { name: it.tenant_name, n: 0 };
      cur.n += 1;
      byTenant.set(it.tenant_id, cur);
    } else others.push(it);
  }
  const rows: Array<{ key: string; tone: "warn" | "risk"; tag: string; title: string; sub: string; panel: Panel }> = [
    ...others.map((it) => ({
      key: `${it.anomaly_type}-${it.tenant_id}-${it.lesson_date ?? ""}`,
      tone: (it.severity === "critical" || it.severity === "high" ? "risk" : "warn") as "warn" | "risk",
      tag: (SEVERITY[it.severity] ?? SEVERITY.info).label,
      title: `${it.tenant_name}: ${lower(ANOMALY_LABELS[it.anomaly_type] ?? it.anomaly_type)}`,
      sub: it.summary,
      panel: { kind: it.anomaly_type === "ATTENDANCE_DROP" ? "attendance" : "attention", branch: it.tenant_id, scope: "period" } as Panel,
    })),
    ...[...byTenant].map(([id, x]) => ({
      key: `unmarked-${id}`, tone: "warn" as const, tag: "Перевірити",
      title: `${countLessons(x.n)} не відмічено`, sub: x.name,
      panel: { kind: "unmarked", branch: id, scope: "period" } as Panel,
    })),
  ];
  const shown = rows.slice(0, 5);
  return (
    <section className="nd-card nd-list-card" aria-labelledby="nd-ps-title">
      <header className="nd-card-head">
        <h3 id="nd-ps-title">Сигнали за період</h3>
        <span className="nd-meta">{rows.length ? `${formatNumber(rows.length)} ${pluralUk(rows.length, "сигнал", "сигнали", "сигналів")}` : "за обраний період"}</span>
      </header>
      {loading ? (
        <div className="nd-rows" aria-busy="true"><span className="nd-skel" style={{ width: "76%" }} /><span className="nd-skel" style={{ width: "58%" }} /></div>
      ) : rows.length === 0 ? (
        <div className="nd-rows"><div className="nd-row static"><span className="nd-pill ok">Спокійно</span><span className="nd-row-text"><span>сигналів за період немає</span></span></div></div>
      ) : (
        <div className="nd-rows">
          {shown.map((r) => (
            <button key={r.key} type="button" className="nd-row" onClick={() => onOpen(r.panel)}>
              <span className={`nd-pill ${r.tone}`}>{r.tag}</span>
              <span className="nd-row-text"><b>{r.title}</b><span>{r.sub}</span></span>
              <span className="nd-row-go" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      )}
      {!loading && rows.length > shown.length && (
        <button type="button" className="nd-card-link" onClick={() => onOpen({ kind: "attention", branch: null, scope: "period" })}>
          Усі сигнали ({formatNumber(rows.length)}) →
        </button>
      )}
    </section>
  );
}
