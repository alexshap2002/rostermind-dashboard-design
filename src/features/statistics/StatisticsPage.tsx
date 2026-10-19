import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataToolbar, EmptyState, PageShell } from "../../components/admin/primitives";
import { formatDateUk, formatNumber, formatUpdatedAt } from "../../lib/format";
import { statisticsQueries, type ReportFilters } from "./api";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Швидкі періоди — як у legacy «Звіт». */
function quickRange(kind: "today" | "week" | "month" | "quarter" | "year"): [string, string] {
  const now = new Date();
  const to = iso(now);
  switch (kind) {
    case "today": return [to, to];
    case "week": {
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return [iso(monday), to];
    }
    case "month": return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), to];
    case "quarter": {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return [iso(qStart), to];
    }
    case "year": return [iso(new Date(now.getFullYear(), 0, 1)), to];
  }
}

const INITIAL_PERFECT_SHOWN = 4;

export function StatisticsPage() {
  const [monthStart] = quickRange("month");
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(iso(new Date()));
  const [clubId, setClubId] = useState("");
  const [allPerfect, setAllPerfect] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const filters: ReportFilters = { dateFrom, dateTo, clubId };
  const clubs = useQuery(statisticsQueries.clubs());
  const report = useQuery(statisticsQueries.report(filters));

  const r = report.data;
  const kpi = r?.monthly_kpi;
  const perfect = r?.perfect_attendance ?? [];
  const shownPerfect = allPerfect ? perfect : perfect.slice(0, INITIAL_PERFECT_SHOWN);

  return (
    <PageShell
      title="Звіт"
      subtitle={
        r
          ? `${formatNumber(kpi?.total_sessions_held ?? 0)} занять · ${formatNumber(kpi?.total_unique_present_children ?? 0)} унікальних дітей за період`
          : "Завантаження…"
      }
    >
      <DataToolbar>
        <input className="tselect" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input className="tselect" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <select className="tselect" value={clubId} onChange={(e) => setClubId(e.target.value)}>
          <option value="">Гурток: всі</option>
          {(clubs.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="spacer" />
        {([
          ["today", "Сьогодні"], ["week", "Тиждень"], ["month", "Місяць"],
          ["quarter", "Квартал"], ["year", "Рік"],
        ] as const).map(([kind, label]) => (
          <button
            key={kind}
            className="btn ghost"
            onClick={() => {
              const [from, to] = quickRange(kind);
              setDateFrom(from);
              setDateTo(to);
            }}
          >
            {label}
          </button>
        ))}
        <button
          className="btn ghost"
          onClick={() => { const [f] = quickRange("month"); setDateFrom(f); setDateTo(iso(new Date())); setClubId(""); }}
        >
          Скинути
        </button>
      </DataToolbar>

      {/* Ключові показники (legacy «Ключові показники») */}
      <div className="metric-strip">
        <div><b>{formatNumber(kpi?.total_sessions_held ?? 0)}</b><span>проведено занять</span></div>
        <div><b>{formatNumber(kpi?.total_unique_present_children ?? 0)}</b><span>унікальних дітей</span></div>
        <div><b>{formatNumber(kpi?.total_present_marks ?? 0)}</b><span>відміток «присутній»</span></div>
        <div><b>{(kpi?.avg_unique_present_per_day ?? 0).toFixed(1)}</b><span>сер. дітей на день</span></div>
        <div><b>{formatNumber(r?.children_stats.children_active_count ?? 0)}</b><span>активних дітей</span></div>
        <div><b>{formatNumber(r?.children_stats.new_children_count ?? 0)}</b><span>нових за період</span></div>
      </div>

      {report.isLoading && <EmptyState title="Обчислення статистики…" />}
      {!report.isLoading && r && kpi?.total_sessions_held === 0 && (
        <EmptyState title="Немає проведених занять за період">
          Змініть дати або фільтр гуртка
        </EmptyState>
      )}

      {r && (kpi?.total_sessions_held ?? 0) > 0 && (
        <div className="duo-col">
          {/* Відвідуваність по днях */}
          <div className="table-card">
            <div className="day-head">Відвідуваність по днях</div>
            <div className="table-scroll">
              <table className="dtable" style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Унікальні діти</th>
                    <th>Відмітки «присутній»</th>
                    <th>Занять</th>
                  </tr>
                </thead>
                <tbody>
                  {r.daily_stats.map((d) => (
                    <tr key={d.date}>
                      <td className="tnum-cell"><b>{formatDateUk(d.date)}</b></td>
                      <td className="tnum-cell">{formatNumber(d.unique_present_children)}</td>
                      <td className="tnum-cell">{formatNumber(d.present_marks)}</td>
                      <td className="tnum-cell">{formatNumber(d.sessions_held)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Проведені заняття по гуртках */}
          <div className="table-card">
            <div className="day-head">Проведені заняття по гуртках</div>
            <div className="table-scroll">
              <table className="dtable" style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>Гурток</th>
                    <th>Занять</th>
                    <th>Унікальні діти</th>
                    <th>Відмітки</th>
                  </tr>
                </thead>
                <tbody>
                  {r.by_club.map((row) => (
                    <tr key={row.club_id}>
                      <td><div className="cell-name">{row.club_name}</div></td>
                      <td className="tnum-cell">{formatNumber(row.sessions_held)}</td>
                      <td className="tnum-cell">{formatNumber(row.unique_present_children)}</td>
                      <td className="tnum-cell">{formatNumber(row.present_marks)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: "#faf6ee", fontWeight: 700 }}>
                    <td>ВСЬОГО</td>
                    <td className="tnum-cell">{formatNumber(r.by_club_totals.total_sessions_held)}</td>
                    <td className="tnum-cell">{formatNumber(r.by_club_totals.total_unique_present_children)}</td>
                    <td className="tnum-cell">{formatNumber(r.by_club_totals.total_present_marks)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 100% відвідуваність */}
      {r && (
        <div className="table-card" style={{ marginTop: 16 }}>
          <div className="day-head">
            Список 100% відвідування
            <span className="chip">{formatNumber(perfect.length)} учнів без пропусків</span>
          </div>
          {perfect.length === 0 ? (
            <div className="table-empty">Немає учнів з бездоганною відвідуваністю за цей період</div>
          ) : (
            <div style={{ padding: 16 }}>
              <div className="perfect-grid">
                {shownPerfect.map((p) => (
                  <div className="perfect-card" key={p.child_id}>
                    <div className="cell-name">{p.full_name}</div>
                    <div className="cell-sub">Гуртки: {p.clubs.join(", ") || "—"}</div>
                    <div className="cell-sub">
                      Відвідано: {p.sessions_present} з {p.sessions_expected} занять
                    </div>
                    <span className="tag create" style={{ marginTop: 6, alignSelf: "flex-start" }}>
                      100% відвідуваність
                    </span>
                  </div>
                ))}
              </div>
              {perfect.length > INITIAL_PERFECT_SHOWN && (
                <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setAllPerfect((v) => !v)}>
                  {allPerfect ? "Згорнути" : `Показати всіх (ще ${perfect.length - INITIAL_PERFECT_SHOWN})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Нові діти за період */}
      {r && (
        <div className="table-card" style={{ marginTop: 16 }}>
          <button
            className="day-head"
            style={{ width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}
            onClick={() => setNewOpen((v) => !v)}
          >
            Список нових дітей
            <span className="chip">{formatNumber(r.children_stats.new_children_count)} · натисніть щоб {newOpen ? "згорнути" : "розгорнути"}</span>
          </button>
          {newOpen && (
            r.children_stats.new_children_list.length === 0 ? (
              <div className="table-empty">Немає нових дітей за цей період</div>
            ) : (
              <div style={{ padding: "8px 0" }}>
                {r.children_stats.new_children_list.map((child) => (
                  <div className="action-row" key={child.child_id} style={{ cursor: "default" }}>
                    <div>
                      <div className="action-text">{child.full_name}</div>
                      <div className="action-meta">Дата створення: {formatUpdatedAt(child.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </PageShell>
  );
}
