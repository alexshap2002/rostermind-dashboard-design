import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, PageShell } from "../../components/admin/primitives";
import { enterBranch, rememberNetworkUrl } from "../branches/api";
import { ApiError, apiDownload } from "../../lib/api";
import {
  formatCurrency, formatDayMonth, formatNumber, formatPercent, formatRangeShort, formatUpdatedAt, pluralUk,
} from "../../lib/format";
import { IconActivity, IconCheckSquare, IconChevron, IconClose, IconDownload, IconMoney, IconStudents } from "../../lib/icons";
import { DEMO } from "../../demo/mockApi";
import { mainBranchExportUrl, mainBranchQueries, UNMARKED_LESSON, type MainBranchFilters, type MainBranchKpi } from "./api";
import { BranchCompare } from "./BranchCompare";
import { Delta, networkTotals, PANEL_KINDS, type Panel, type PanelKind } from "./metrics";
import { MetricPanel } from "./MetricPanel";
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


export function MainBranchPage() {
  const qc = useQueryClient();
  const initial = useMemo(readUrl, []);
  const network = useQuery(mainBranchQueries.context());
  const [filters, setFilters] = useState<MainBranchFilters>(initial.filters);
  const [tab, setTab] = useState<Tab>(initial.tab ?? "lessons");
  const [panel, setPanelState] = useState<Panel | null>(initial.panel);
  const [problemFilter, setProblemFilter] = useState<{ severity?: string; type?: string; cursor: number }>({ cursor: 0 });
  const [trendMode, setTrendMode] = useState<"daily" | "weekly" | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [branchMenu, setBranchMenu] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const branchMenuRef = useRef<HTMLDivElement>(null);
  const preset: Preset = customOpen ? "custom" : presetOf(filters);
  const setPanel = useCallback((next: Panel | null) => setPanelState(next), []);

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

  useEffect(() => {
    if (!branchMenu) return;
    const close = (e: MouseEvent) => { if (!branchMenuRef.current?.contains(e.target as Node)) setBranchMenu(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [branchMenu]);

  const datasets = useMemo(() => new Set(network.data?.capabilities.datasets ?? []), [network.data]);
  const enabled = (dataset: string) => Boolean(network.data && datasets.has(dataset));
  const visibleTabs = useMemo(() => TABS.filter((t) => datasets.has(t.dataset)), [datasets]);

  const today = iso(kyivToday());
  const todayFilters: MainBranchFilters = { dateFrom: today, dateTo: today, branchIds: [], refresh: filters.refresh };
  const nowFilters: MainBranchFilters = { dateFrom: iso(addDays(kyivToday(), -(NOW_DAYS - 1))), dateTo: today, branchIds: [], refresh: filters.refresh };

  const kpi = useQuery({ ...mainBranchQueries.kpi(filters), enabled: enabled("kpi") });
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

  if (network.error instanceof ApiError) {
    return (
      <PageShell title="Мережа шкіл">
        <EmptyState title="Немає доступу до мережі">{network.error.message}</EmptyState>
      </PageShell>
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
  const attentionByTenant = periodAttention.data?.totals.by_tenant ?? {};
  const open = (kind: PanelKind) => () => setPanel({ kind, branch: null, scope: "period" });

  const net = k ? networkTotals(k.branch_rows) : null;
  const trendCaption = span < 7 ? "оберіть щонайменше тиждень" : mode === "daily" ? "по днях" : "по тижнях";

  return (
    <PageShell
      title="Мережа шкіл"
      subtitle={network.data
        ? [`${formatNumber(activeBranches.length)} ${pluralUk(activeBranches.length, "активна філія", "активні філії", "активних філій")}`,
           k ? `${formatNumber(k.teachers_total)} ${pluralUk(k.teachers_total, "працівник", "працівники", "працівників")}` : null,
           pendingCount ? `${pendingCount} ${pluralUk(pendingCount, "чекає", "чекають", "чекають")} оплати` : null,
           k ? formatUpdatedAt(k.generated_at) : null].filter(Boolean).join(" · ")
        : "Завантаження…"}
    >
      <div className="nd-page">
        {DEMO && <div className="nd-demo" role="note"><b>Демо-версія</b> · дані вигадані, лише для обговорення дизайну. Зміни й переходи у філії вимкнено.</div>}

        {/* ── А. Контекст: один період, один фільтр філій, вторинний експорт ── */}
        <div className="nd-toolbar" role="group" aria-label="Період і філії">
          <div className="nd-seg" role="radiogroup" aria-label="Період">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" role="radio" aria-checked={preset === p.key} className={preset === p.key ? "on" : ""}
                onClick={() => { setCustomOpen(false); setRange(presetRange(p.key)); }}>{p.label}</button>
            ))}
            <button type="button" role="radio" aria-checked={preset === "custom"} className={preset === "custom" ? "on" : ""} onClick={() => setCustomOpen(true)}>Свій період</button>
          </div>
          {preset === "custom" && (
            <div className="nd-dates">
              <label><span>Від</span><input type="date" value={filters.dateFrom} max={filters.dateTo} onChange={(e) => e.target.value && setRange({ dateFrom: e.target.value, dateTo: filters.dateTo })} /></label>
              <label><span>До</span><input type="date" value={filters.dateTo} min={filters.dateFrom} onChange={(e) => e.target.value && setRange({ dateFrom: filters.dateFrom, dateTo: e.target.value })} /></label>
            </div>
          )}
          {activeBranches.length > 1 && (
            <div className="nd-dd" ref={branchMenuRef}>
              <button type="button" className="nd-dd-btn" aria-haspopup="true" aria-expanded={branchMenu} onClick={() => setBranchMenu((v) => !v)}>
                {branchesLabel} <IconChevron className="nd-dd-chev" aria-hidden="true" />
              </button>
              {branchMenu && (
                <div className="nd-dd-menu">
                  <label className="nd-check"><input type="checkbox" checked={filters.branchIds.length === 0} onChange={() => setFilters((f) => ({ ...f, refresh: false, branchIds: [] }))} /> Усі філії</label>
                  {activeBranches.map((b) => (
                    <label key={b.tenant_id} className="nd-check">
                      <input type="checkbox" checked={filters.branchIds.includes(b.tenant_id)} onChange={() => toggleBranch(b.tenant_id)} /> {b.tenant_name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <span className="nd-spacer" />
          <button type="button" className="btn ghost sm" onClick={onRefresh}>Оновити</button>
          {network.data?.capabilities.can_export_full_report && (
            <button type="button" className="btn ghost sm keep-label" disabled={downloading} onClick={downloadReport}>
              <IconDownload /><span>{downloading ? "Готуємо…" : "Excel"}</span>
            </button>
          )}
        </div>

        {notice && <div className="nd-notice" role="status">{notice}<button type="button" className="nd-icon-btn" aria-label="Закрити" onClick={() => setNotice(null)}><IconClose /></button></div>}
        {failed && (
          <div className="form-error" role="alert">
            Частину даних не завантажено: {failed.message}{" "}
            <button type="button" className="btn ghost sm" onClick={onRefresh}>Спробувати ще</button>
          </div>
        )}

        <div className="nd-context">
          <h3>{periodLabel} · {branchesLabel}</h3>
          {k && <span className="nd-compare" title="Як рахуємо зміну">{compareText(k.comparison, filters)}</span>}
        </div>

        <div className="bento nd-bento">
          {/* ── Hero: відвідуваність мережі з динамікою — головна метрика, тому єдина темна плитка ── */}
          <section className="tile nd-hero" aria-labelledby="nd-hero-title">
            <div className="nd-hero-side">
              <div className="nd-hero-label" id="nd-hero-title">Відвідуваність</div>
              {k && net ? (
                <>
                  <div className="nd-hero-big num">{k.attendance_has_data ? formatPercent(k.attendance_rate_pct) : "—"}</div>
                  <div className="nd-hero-sub">
                    {!k.attendance_has_data ? "занять з дітьми за період не було"
                      : noCompare ? "порівняємо завтра — день ще триває"
                      : attDelta === null || attDelta === undefined ? "немає з чим порівняти"
                      : <><Delta value={attDelta} unit="pp" /> до попереднього періоду</>}
                  </div>
                  {k.attendance_has_data && (
                    <div className="nd-hero-sub">присутні {formatNumber(net.present_students)} з {formatNumber(net.total_students)} очікуваних</div>
                  )}
                </>
              ) : (
                <>
                  <span className="nd-skel dark" style={{ width: 140, height: 44 }} />
                  <span className="nd-skel dark" style={{ width: 180 }} />
                </>
              )}
              <button type="button" className="nd-hero-go" onClick={open("attendance")}>Переглянути по філіях →</button>
            </div>
            <div className="nd-hero-chart">
              <div className="nd-hero-chart-head">
                <span className="nd-hero-caption">Динаміка за період · {trendCaption}</span>
                {span >= 7 && (
                  <div className="nd-seg sm dark" role="radiogroup" aria-label="Крок графіка">
                    <button type="button" role="radio" aria-checked={mode === "daily"} className={mode === "daily" ? "on" : ""} onClick={() => setTrendMode("daily")}>По днях</button>
                    <button type="button" role="radio" aria-checked={mode === "weekly"} className={mode === "weekly" ? "on" : ""} onClick={() => setTrendMode("weekly")}>По тижнях</button>
                  </div>
                )}
              </div>
              {span >= 7
                ? <TrendPanel points={points} loading={trends.isLoading} dark compact />
                : <div className="nd-empty on-dark">Для динаміки оберіть період щонайменше з тижня — тоді тут з'явиться графік.</div>}
            </div>
          </section>

          {/* ── Б. На зараз ── */}
          <NowStrip
            today={todayKpi.data}
            unmarked={unmarked.data}
            attention={attention.data}
            days={NOW_DAYS}
            loading={todayKpi.isLoading || unmarked.isLoading || attention.isLoading}
            onOpen={setPanel}
          />

          {/* ── В. Чотири показники за період ── */}
          <Kpi icon={<IconStudents />} label="Діти в базі" loading={!k} onOpen={open("students")}
            value={k ? formatNumber(k.students_total) : ""}
            sub="поточна база на кінець періоду"
            extra={k && (
              <button type="button" className="nd-kpi-chip" onClick={open("new")}>
                {k.students_new > 0 ? `+${formatNumber(k.students_new)} нових за період` : "нових за період немає"}
              </button>
            )} />
          <Kpi icon={<IconCheckSquare />} label="Проведено занять" loading={!k} onOpen={open("lessons")}
            value={k ? <>{formatNumber(k.lessons_completed)}<small>з {formatNumber(k.lessons_scheduled)}</small></> : ""}
            sub={k && k.lessons_cancelled > 0 ? `навчальні заняття з відміткою · ${formatNumber(k.lessons_cancelled)} скасовано` : "навчальні заняття з відміткою"}
            extra={k && (
              <>
                {k.lessons_unmarked_overdue > 0
                  ? <button type="button" className="nd-pill warn" onClick={() => setPanel({ kind: "unmarked", branch: null, scope: "period" })}>{formatNumber(k.lessons_unmarked_overdue)} не відмічено</button>
                  : <span className="nd-pill ok">усі відмічено</span>}
                {k.lessons_upcoming > 0 && <span className="nd-pill">{formatNumber(k.lessons_upcoming)} попереду</span>}
              </>
            )} />
          <Kpi icon={<IconActivity />} label="Відвідуваність" loading={!k} onOpen={open("attendance")}
            value={k ? (k.attendance_has_data ? formatPercent(k.attendance_rate_pct) : "—") : ""}
            sub={k ? (!k.attendance_has_data ? "занять з дітьми не було" : noCompare ? "порівняємо завтра — день ще триває"
              : attDelta === null || attDelta === undefined ? "немає з чим порівняти" : <><Delta value={attDelta} unit="pp" /> до попереднього періоду</>) : null} />
          <Kpi icon={<IconMoney />} label="Нараховано зарплат" loading={!k} onOpen={open("payroll")}
            value={k ? `${formatCurrency(k.payroll_total_uah)} ₴` : ""}
            sub={k ? (noCompare ? "порівняємо завтра — день ще триває"
              : payDelta === null || payDelta === undefined ? "немає з чим порівняти" : <><Delta value={payDelta} unit="pct" tone="neutral" /> до попереднього періоду</>) : null} />

          {/* ── Г. Філії — головний робочий блок ── */}
          <section className="tile nd-branches" aria-labelledby="nd-branches-title">
            <div className="tile-head">
              <h3 id="nd-branches-title">Філії</h3>
              <span className="chip">Назва — огляд філії тут · «Працювати у філії» — перейти в її роботу · число — розбивка показника</span>
            </div>
            <BranchCompare
              rows={k?.branch_rows ?? []}
              attentionByTenant={attentionByTenant}
              loading={kpi.isLoading}
              canEnter={canEnter}
              busyId={busyId}
              onOpen={setPanel}
              onEnter={(r) => goToBranch(r.tenant_id, r.tenant_name, "/")}
            />
            {pendingCount > 0 && (
              <p className="nd-aux">{pendingCount} {pluralUk(pendingCount, "філія чекає", "філії чекають", "філій чекають")} оплати RosterMind — <a className="link" href="/branches">Філії й підписка</a></p>
            )}
          </section>

          {/* ── Детальні звіти ── */}
          <details className="tile nd-details" open={initial.tab !== null}>
            <summary><h3>Детальні звіти</h3><span>заняття, гуртки, відвідуваність, зарплати, сигнали — за обраний період</span></summary>
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
        </div>
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
    </PageShell>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Клікабельна KPI-плитка: нейтральна піктограма, число, зміна й завжди видиме «Переглянути»;
    додаткові дії (нові діти, не відмічено) — окремими кнопками під основною. */
function Kpi({ icon, label, value, sub, extra, loading, onOpen }: {
  icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; extra?: ReactNode; loading: boolean; onOpen: () => void;
}) {
  return (
    <div className="tile hov nd-kpi">
      <button type="button" className="nd-kpi-main" onClick={onOpen} aria-label={`${label}: переглянути по філіях`}>
        <span className="kpi-icon nd-kpi-ic" aria-hidden="true">{icon}</span>
        <span className="nd-kpi-text">
          <span className="kpi-label">{label}</span>
          {loading ? <span className="nd-skel" style={{ width: 110, height: 28 }} /> : <span className="kpi-value num nd-kpi-value">{value}</span>}
          {sub && <span className="nd-kpi-sub">{sub}</span>}
          <span className="nd-kpi-go">Переглянути по філіях →</span>
        </span>
      </button>
      {extra && <div className="nd-kpi-extra">{extra}</div>}
    </div>
  );
}
