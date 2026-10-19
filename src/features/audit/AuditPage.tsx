import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { formatNumber, formatUpdatedAt } from "../../lib/format";
import { IconClose, IconDownload, IconSearch, IconTrash } from "../../lib/icons";
import { TopNav } from "../../components/layout/TopNav";
import { useScrollShades } from "../../components/admin/useScrollShades";
import { dashboardQueries } from "../dashboard/api";
import { auditApi, auditQueries, type AuditFilters, type AuditLog } from "./api";
import {
  ACTION_FILTER_OPTIONS, ENTITY_LABELS, actionLabel, entityLabel,
} from "./labels";

/** Експорт видимих (відфільтрованих) записів у CSV — як legacy «Експорт в Excel». */
function exportCsv(logs: AuditLog[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["Дата і час", "Користувач", "Дія", "Тип", "Об'єкт", "Опис"],
    ...logs.map((l) => [
      formatUpdatedAt(l.timestamp), l.user_name, actionLabel(l.action_type),
      entityLabel(l.entity_type), l.entity_name ?? "", l.description,
    ]),
  ];
  const csv = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 50;

function actionTagClass(action: string): string {
  if (action === "CREATE") return "create";
  if (action === "UPDATE") return "update";
  if (action === "DELETE") return "delete";
  if (action === "ENROLL" || action === "IMPORT") return "enroll";
  return "";
}

export function AuditPage() {
  const qc = useQueryClient();
  const summary = useQuery(dashboardQueries.summary());
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionType, setActionType] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deleteOldOpen, setDeleteOldOpen] = useState(false);
  const [deleteOldDays, setDeleteOldDays] = useState("365");
  const [details, setDetails] = useState<AuditLog | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const scrollRef = useScrollShades<HTMLDivElement>();

  const filters: AuditFilters = { page, pageSize: PAGE_SIZE, search, actionType, entityType, dateFrom, dateTo };

  async function handleExport() {
    setExporting(true);
    setActionError(null);
    try {
      exportCsv(await auditApi.exportRows(filters));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Не вдалося експортувати");
    } finally {
      setExporting(false);
    }
  }
  const logs = useQuery(auditQueries.logs(filters));
  const stats = useQuery(auditQueries.stats());

  const st = stats.data?.actions ?? {};
  const hasFilters = search || actionType || entityType || dateFrom || dateTo;

  const s = summary.data;
  const counts = s
    ? { students: s.stats.students, teachers: s.stats.teachers, clubs: s.stats.clubs, active_schedules: s.stats.active_schedules }
    : {};

  const deleteOld = useMutation({
    mutationFn: () => auditApi.deleteOld(Number(deleteOldDays)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit"] });
      setDeleteOldOpen(false);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "Не вдалося очистити старі записи"),
  });

  function resetFilters() {
    setSearch(""); setActionType(""); setEntityType(""); setDateFrom(""); setDateTo(""); setPage(1);
  }

  // Пагінація з вікном ±2 і трьома крапками
  const totalPages = logs.data?.total_pages ?? 1;
  const pageNums = useMemo(() =>
    Array.from({ length: totalPages }, (_, i) => i + 1)
      .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2),
    [totalPages, page]);

  if (summary.error instanceof ApiError && summary.error.status === 401) {
    return <Navigate to="/login" replace />;
  }

  const rows = logs.data?.logs ?? [];

  return (
    <>
      <TopNav counts={counts} user={s?.user} tenantName={s?.tenant.name} />

      <div className="content wide">
        <div className="page-head">
          <div>
            <h2>Історія змін</h2>
            <p>
              {logs.data
                ? `${formatNumber(logs.data.total)} записів · сторінка ${logs.data.page} з ${logs.data.total_pages}`
                : "Завантаження…"}
            </p>
          </div>
          <div className="row-actions">
            <button className="btn ghost" onClick={handleExport} disabled={exporting}><IconDownload />{exporting ? "Готуємо…" : "Експорт"}</button>
            <button className="btn ghost danger-ghost" onClick={() => setDeleteOldOpen(true)}><IconTrash />Очистити старі</button>
          </div>
        </div>

        {actionError && (
          <div className="form-error" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>{actionError}</span>
            <button className="link" onClick={() => setActionError(null)}>Закрити</button>
          </div>
        )}

        <div className="toolbar">
          <div className="tsearch">
            <IconSearch />
            <input placeholder="Пошук: дія, користувач, об'єкт…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="tselect" value={actionType} onChange={(e) => { setActionType(e.target.value); setPage(1); }}>
            <option value="">Дія: всі</option>
            {ACTION_FILTER_OPTIONS.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
          <select className="tselect" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
            <option value="">Об'єкт: всі</option>
            {Object.keys(ENTITY_LABELS).map((e) => <option key={e} value={e}>{ENTITY_LABELS[e]}</option>)}
          </select>
          <label className="tsel-date"><span>з</span><input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} /></label>
          <label className="tsel-date"><span>по</span><input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} /></label>
          {hasFilters && <button className="btn ghost" onClick={resetFilters}>Скинути</button>}
        </div>

        <div className="metric-strip">
          <div><b>{formatNumber(stats.data?.total_logs ?? 0)}</b><span>подій за 30 днів</span></div>
          <div><b>{formatNumber(st.CREATE ?? 0)}</b><span>створено</span></div>
          <div><b>{formatNumber(st.UPDATE ?? 0)}</b><span>оновлено</span></div>
          <div><b>{formatNumber(st.DELETE ?? 0)}</b><span>видалено</span></div>
        </div>

        <div className="table-card">
          <div className="table-scroll" ref={scrollRef}>
            <table className="dtable" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th className="sticky-l" style={{ minWidth: 140 }}>Час</th>
                  <th>Дія</th>
                  <th style={{ minWidth: 170 }}>Об'єкт</th>
                  <th style={{ minWidth: 140 }}>Користувач</th>
                  <th style={{ minWidth: 220 }}>Опис</th>
                </tr>
              </thead>
              <tbody>
                {logs.isLoading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 5 }).map((__, j) => (
                      <td key={j}><span className="sk" style={{ display: "block", height: 14 }} /></td>
                    ))}</tr>
                  ))}
                {rows.map((log) => (
                  <tr key={log.id} onClick={() => setDetails(log)} title="Деталі запису">
                    <td className="sticky-l tnum-cell cell-muted">{formatUpdatedAt(log.timestamp)}</td>
                    <td><span className={`tag ${actionTagClass(log.action_type)}`}>{actionLabel(log.action_type)}</span></td>
                    <td>
                      <div className="cell-name">{log.entity_name ?? entityLabel(log.entity_type)}</div>
                      <div className="cell-sub">{entityLabel(log.entity_type)}{log.entity_id ? ` #${log.entity_id}` : ""}</div>
                    </td>
                    <td>{log.user_name}</td>
                    <td><div className="cell-sub" style={{ color: "var(--text-2)" }}>{log.description}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.error && (
              <div className="table-empty">
                <div className="big">{logs.error instanceof ApiError && logs.error.status === 403 ? "Немає доступу" : "Не вдалося завантажити дані"}</div>
                {logs.error instanceof ApiError ? logs.error.message : "Спробуйте оновити сторінку"}
              </div>
            )}
            {!logs.isLoading && !logs.error && rows.length === 0 && (
              <div className="table-empty">
                <div className="big">{hasFilters ? "Нічого не знайдено" : "Історія порожня"}</div>
                {hasFilters ? "Змініть фільтри або пошук" : "Події з'являться після змін у системі"}
              </div>
            )}
          </div>
          <div className="table-foot">
            <span>Показано {formatNumber(rows.length)} з {formatNumber(logs.data?.total ?? 0)}</span>
            {totalPages > 1 && (
              <div className="pager">
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
                {pageNums.map((p, idx, arr) => (
                  <span key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ padding: "0 4px" }}>…</span>}
                    <button className={p === page ? "on" : ""} onClick={() => setPage(p)}>{p}</button>
                  </span>
                ))}
                <button disabled={page === totalPages} onClick={() => setPage(page + 1)}>›</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {details && (
        <div className="modal-overlay" onClick={() => setDetails(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Деталі запису</h3>
              <button className="close" aria-label="Закрити" onClick={() => setDetails(null)}><IconClose /></button>
            </div>
            <div className="modal-body">
              <div className="fgrid" style={{ fontSize: 13.5 }}>
                <div className="span-6"><b>Дата і час:</b> {formatUpdatedAt(details.timestamp)}</div>
                <div className="span-6"><b>Користувач:</b> {details.user_name}</div>
                <div className="span-6"><b>Дія:</b> <span className={`tag ${actionTagClass(details.action_type)}`}>{actionLabel(details.action_type)}</span></div>
                <div className="span-6"><b>Тип:</b> {entityLabel(details.entity_type)}{details.entity_id ? ` #${details.entity_id}` : ""}</div>
                {details.entity_name && <div className="span-12"><b>Об'єкт:</b> {details.entity_name}</div>}
                <div className="span-12"><b>Опис:</b> {details.description}</div>
              </div>
              {details.changes_json && Object.keys(details.changes_json).length > 0 && (
                <>
                  <div className="fsection">Деталі змін</div>
                  <pre style={{
                    background: "#f5efe4", borderRadius: "var(--r-md)", padding: 14,
                    fontSize: 12, lineHeight: 1.5, overflowX: "auto", whiteSpace: "pre-wrap",
                  }}>
                    {JSON.stringify(details.changes_json, null, 2)}
                  </pre>
                </>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setDetails(null)}>Закрити</button>
            </div>
          </div>
        </div>
      )}

      {deleteOldOpen && (
        <div className="modal-overlay" onClick={() => setDeleteOldOpen(false)}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Очистити старі записи?</h3>
              <button className="close" aria-label="Закрити" onClick={() => setDeleteOldOpen(false)}><IconClose /></button>
            </div>
            <div className="modal-body">
              <div className="field span-12">
                <label htmlFor="del-days">Видалити записи, старіші за</label>
                <select id="del-days" value={deleteOldDays} onChange={(e) => setDeleteOldDays(e.target.value)}>
                  <option value="365">1 рік</option>
                  <option value="730">2 роки</option>
                  <option value="1095">3 роки</option>
                  <option value="180">6 місяців</option>
                  <option value="90">3 місяці</option>
                  <option value="30">1 місяць</option>
                </select>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 10 }}>
                Записи в поточному закладі, старіші за обраний період, буде видалено. Новіша історія залишиться.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn secondary" onClick={() => setDeleteOldOpen(false)}>Скасувати</button>
              <button className="btn danger" disabled={deleteOld.isPending} onClick={() => deleteOld.mutate()}>
                {deleteOld.isPending ? "Очищуємо…" : "Очистити"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
