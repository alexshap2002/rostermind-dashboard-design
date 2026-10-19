import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataToolbar, EmptyState, PageShell, StatusTag } from "../../components/admin/primitives";
import { formatCurrency, formatNumber, formatUpdatedAt } from "../../lib/format";
import { IconClose } from "../../lib/icons";
import {
  ANOMALY_LABELS, lessonStatisticsQueries, teacherStatusLabel,
  type LessonStatFilters, type TeacherDailySummary,
} from "./api";

const IconDownload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
);

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function monthBounds(): [string, string] {
  const now = new Date();
  return [
    iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  ];
}

/** Експорт зведення в CSV — заміна legacy XLSX-експорту. */
function exportCsv(rows: TeacherDailySummary[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const data = [
    ["Вчитель", "Уроків", "Присутній", "Відсутній", "Без відмітки", "Сума, грн"],
    ...rows.map((r) => [
      r.teacher_name, r.lessons_total, r.lessons_present, r.lessons_absent,
      r.lessons_unmarked, Number(r.total_amount || 0),
    ]),
  ];
  const csv = "﻿" + data.map((r) => r.map(esc).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `lesson_statistics_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function LessonStatisticsPage() {
  const [defFrom, defTo] = monthBounds();
  const [dateFrom, setDateFrom] = useState(defFrom);
  const [dateTo, setDateTo] = useState(defTo);
  const [teacherId, setTeacherId] = useState("");
  const [clubId, setClubId] = useState("");
  const [hideNoTariff, setHideNoTariff] = useState(false);
  const [lessonsOf, setLessonsOf] = useState<TeacherDailySummary | null>(null);

  const filters: LessonStatFilters = { dateFrom, dateTo, teacherId, clubId };
  const summary = useQuery(lessonStatisticsQueries.summary(filters));
  const anomalies = useQuery(lessonStatisticsQueries.anomalies(filters));
  const clubs = useQuery(lessonStatisticsQueries.clubs());
  const teachers = useQuery(lessonStatisticsQueries.teachers());

  const rows = useMemo(() => {
    let list = summary.data ?? [];
    if (hideNoTariff) list = list.filter((r) => r.has_active_tariff_today);
    return [...list].sort((a, b) => Number(b.total_amount || 0) - Number(a.total_amount || 0));
  }, [summary.data, hideNoTariff]);

  const totalAmount = rows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);

  function setQuick(kind: "today" | "week" | "month") {
    const now = new Date();
    if (kind === "today") {
      setDateFrom(iso(now));
      setDateTo(iso(now));
    } else if (kind === "week") {
      const from = new Date(now);
      from.setDate(now.getDate() - 6); // сьогодні + попередні 6 = рівно 7 днів
      setDateFrom(iso(from));
      setDateTo(iso(now));
    } else {
      const [f, t] = monthBounds();
      setDateFrom(f);
      setDateTo(t);
    }
  }

  return (
    <PageShell
      title="Статистика"
      subtitle={
        summary.data
          ? `${formatNumber(rows.length)} вчителів · ${formatCurrency(totalAmount)} грн за період`
          : "Завантаження…"
      }
      actions={
        <button className="btn ghost" onClick={() => exportCsv(rows)}>
          <IconDownload />Експорт
        </button>
      }
    >
      <DataToolbar>
        <input className="tselect" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input className="tselect" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <select className="tselect" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">Вчитель: всі</option>
          {(teachers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
        <select className="tselect" value={clubId} onChange={(e) => setClubId(e.target.value)}>
          <option value="">Гурток: всі</option>
          {(clubs.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className={`check${hideNoTariff ? " on" : ""}`} style={{ padding: "8px 12px" }}>
          <input type="checkbox" checked={hideNoTariff} onChange={() => setHideNoTariff((v) => !v)} />
          Сховати без тарифів
        </label>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => setQuick("today")}>Сьогодні</button>
        <button className="btn ghost" onClick={() => setQuick("week")}>Тиждень</button>
        <button className="btn ghost" onClick={() => setQuick("month")}>Місяць</button>
        <button
          className="btn ghost"
          onClick={() => { const [f, t] = monthBounds(); setDateFrom(f); setDateTo(t); setTeacherId(""); setClubId(""); setHideNoTariff(false); }}
        >
          Скинути
        </button>
      </DataToolbar>

      {summary.isLoading && <EmptyState title="Завантажуємо статистику…" />}
      {!summary.isLoading && rows.length === 0 && (
        <EmptyState title="Немає даних за заданими фільтрами">
          Змініть період або фільтри
        </EmptyState>
      )}

      {rows.length > 0 && (
        <div className="table-card">
          <div className="table-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Вчитель</th>
                  <th style={{ minWidth: 170 }}>Гурток(и)</th>
                  <th style={{ minWidth: 150 }}>Тариф</th>
                  <th>Уроки</th>
                  <th>Загальна сума</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const clubNames = [...new Set(r.lessons.map((l) => l.club_name).filter(Boolean))] as string[];
                  const tariffs = [...new Set(
                    r.lessons
                      .filter((l) => l.tariff_amount != null)
                      .map((l) => `${formatCurrency(Number(l.tariff_amount))} ₴${l.tariff_label ? ` (${l.tariff_label})` : ""}`),
                  )];
                  return (
                    <tr key={r.teacher_id} onClick={() => setLessonsOf(r)} title="Натисніть для списку уроків">
                      <td>
                        <div className="cell-name">{r.teacher_name}</div>
                        <div className="cell-sub">
                          Уроків: {r.lessons_total} · присутній: {r.lessons_present}
                          {r.lessons_absent > 0 && ` · відсутній: ${r.lessons_absent}`}
                          {r.lessons_unmarked > 0 && ` · без відмітки: ${r.lessons_unmarked}`}
                        </div>
                      </td>
                      <td>
                        {clubNames.length ? (
                          <ul className="vlist olive">{clubNames.map((n) => <li key={n}>{n}</li>)}</ul>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </td>
                      <td>
                        {tariffs.length ? (
                          <ul className="vlist gold">{tariffs.map((t) => <li key={t}>{t}</li>)}</ul>
                        ) : (
                          <StatusTag tone="delete">Немає тарифу</StatusTag>
                        )}
                      </td>
                      <td className="tnum-cell">{formatNumber(r.lessons_total)}</td>
                      <td className="tnum-cell"><b>{formatCurrency(Number(r.total_amount || 0))} грн</b></td>
                      <td><span className="link">Уроки →</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span>Разом за період: <b>{formatCurrency(totalAmount)} грн</b></span>
          </div>
        </div>
      )}

      {/* Аномалії (legacy «Аномалії за фільтрами») */}
      <div className="table-card" style={{ marginTop: 16 }}>
        <div className="day-head">
          Аномалії за фільтрами
          <span className="chip">уроки, які потребують уваги адміністратора</span>
        </div>
        {(anomalies.data?.length ?? 0) === 0 ? (
          <div className="table-empty">Аномалій за вибраними фільтрами не знайдено</div>
        ) : (
          <div className="table-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Дата/час</th>
                  <th style={{ minWidth: 180 }}>Вчитель(і)</th>
                  <th>Гурток</th>
                  <th>Діти</th>
                  <th style={{ minWidth: 200 }}>Аномалії</th>
                  <th>Примітка</th>
                </tr>
              </thead>
              <tbody>
                {(anomalies.data ?? []).map((a) => (
                  <tr key={a.lesson_id} style={{ cursor: "default" }}>
                    <td className="tnum-cell">{formatUpdatedAt(a.lesson_date)}</td>
                    <td>
                      <ul className="vlist">
                        {a.teachers.map((t) => {
                          const st = teacherStatusLabel(t.status);
                          return (
                            <li key={t.teacher_id}>
                              {t.teacher_name}{" "}
                              <StatusTag tone={st.tone}>{st.label}</StatusTag>{" "}
                              <StatusTag tone={t.has_tariff ? "create" : "neutral"}>
                                {t.has_tariff ? "є тариф" : "без тарифу"}
                              </StatusTag>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                    <td>{a.club_name ?? "—"}</td>
                    <td className="tnum-cell">{a.present_students}/{a.total_students}</td>
                    <td>
                      <ul className="vlist" style={{ gap: 6 }}>
                        {a.anomaly_types.map((type) => (
                          <li key={type}><StatusTag tone="delete">{ANOMALY_LABELS[type] ?? type}</StatusTag></li>
                        ))}
                      </ul>
                    </td>
                    <td className="cell-muted">
                      {a.notes || (a.present_students === 0 ? "Не було жодної присутньої дитини" : "—")}
                      <div style={{ marginTop: 6 }}>
                        <a className="link" href={`/conducted-lessons?edit=${a.lesson_id}`}>Редагувати урок →</a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Модалка «Уроки вчителя» (legacy teacherLessonsModal) */}
      {lessonsOf && (
        <div className="modal-overlay" onClick={() => setLessonsOf(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>
                Уроки · {lessonsOf.teacher_name}
                <span className="chip" style={{ marginLeft: 10 }}>
                  {lessonsOf.lessons_total} уроків · {formatCurrency(Number(lessonsOf.total_amount || 0))} грн
                </span>
              </h3>
              <button className="close" aria-label="Закрити" onClick={() => setLessonsOf(null)}><IconClose /></button>
            </div>
            <div className="modal-body">
              {lessonsOf.lessons.map((l) => {
                const st = teacherStatusLabel(l.teacher_status);
                return (
                  <div className="pane-row" key={l.lesson_id} style={{ marginBottom: 8 }}>
                    <div>
                      <div className="pane-name">
                        {l.club_name ?? "—"} <StatusTag tone={st.tone}>{st.label}</StatusTag>
                      </div>
                      <div className="pane-meta">
                        {formatUpdatedAt(l.lesson_date)} · присутні {l.present_students}/{l.total_students}
                        {l.lesson_amount != null && ` · ${formatCurrency(Number(l.lesson_amount))} грн`}
                      </div>
                      {(l.notes || l.total_students === 0) && (
                        <div className="pane-meta">
                          {l.notes || "Не було жодної дитини на уроці"}
                        </div>
                      )}
                    </div>
                    <a className="btn ghost" style={{ padding: "6px 12px", fontSize: 12 }} href={`/conducted-lessons?edit=${l.lesson_id}`}>
                      Редагувати
                    </a>
                  </div>
                );
              })}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setLessonsOf(null)}>Закрити</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
