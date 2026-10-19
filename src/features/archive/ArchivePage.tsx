import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataToolbar, EmptyState, PageShell, StatusTag } from "../../components/admin/primitives";
import { ApiError } from "../../lib/api";
import { formatNumber, formatUpdatedAt } from "../../lib/format";
import { IconClose, IconPlus, IconSearch } from "../../lib/icons";
import { archiveApi, archiveQueries, type ArchiveContent, type ArchiveItem } from "./api";

const IconDownload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
);
const IconUpload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
);
const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" /></svg>
);
const IconRestore = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M1 4v6h6M3.5 15a9 9 0 102.1-9.4L1 10" /></svg>
);

const COUNT_LABELS: Record<string, string> = {
  students: "Учні",
  teachers: "Вчителі",
  clubs: "Гуртки",
  conducted_lessons: "Уроки",
  schedules: "Розклад",
  audit_logs: "Аудит",
  users: "Користувачі",
};

/** Створення архіву: назва + режим очищення (none/partial/full) з категоріями. */
function CreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const wipeOptions = useQuery(archiveQueries.wipeOptions());
  const [name, setName] = useState("");
  const [wipeType, setWipeType] = useState("none");
  const [targets, setTargets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => archiveApi.create(name.trim(), wipeType, targets),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archives"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Не вдалося створити архів"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Вкажіть назву архіву");
    if (wipeType === "partial" && targets.length === 0)
      return setError("Оберіть, що саме очистити, або режим «Без очищення»");
    create.mutate();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="modal-head">
          <h3>Створити архів</h3>
          <button type="button" className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}
          <div className="fgrid">
            <div className="field span-12">
              <label htmlFor="a-name">Назва архіву *</label>
              <input
                id="a-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Навчальний рік ${new Date().getFullYear()}`}
                required
                autoFocus
              />
            </div>
            <div className="field span-12">
              <label htmlFor="a-wipe">Після архівації</label>
              <select id="a-wipe" value={wipeType} onChange={(e) => setWipeType(e.target.value)}>
                <option value="none">Без очищення — просто зберегти копію</option>
                <option value="partial">Часткове очищення — обрати категорії</option>
                <option value="full">Повне очищення — видалити все (крім власника)</option>
              </select>
            </div>
          </div>

          {wipeType === "partial" && (
            <>
              <div className="fsection">Що очистити після архівації</div>
              <div className="check-grid">
                {(wipeOptions.data ?? []).map((c) => (
                  <label className={`check${targets.includes(c.key) ? " on" : ""}`} key={c.key} title={c.description}>
                    <input
                      type="checkbox"
                      checked={targets.includes(c.key)}
                      onChange={() =>
                        setTargets((prev) =>
                          prev.includes(c.key) ? prev.filter((x) => x !== c.key) : [...prev, c.key],
                        )
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}

          {wipeType === "full" && (
            <div className="form-error" style={{ marginTop: 14 }}>
              Увага: всі дані тенанта буде видалено після створення архіву. Відновити можна
              лише з цього архіву.
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>Скасувати</button>
          <button type="submit" className={`btn${wipeType === "full" ? " danger" : ""}`} disabled={create.isPending}>
            {create.isPending ? "Архівуємо…" : "Створити архів"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Перегляд вмісту архіву — стат-картки + таби з таблицями (legacy archive_view). */
function ViewModal({ archive, onClose }: { archive: ArchiveItem; onClose: () => void }) {
  const content = useQuery(archiveQueries.content(archive.id));
  const [tab, setTab] = useState<keyof ArchiveContent["sections"]>("students");
  const data = content.data;

  const TABS: { key: keyof ArchiveContent["sections"]; label: string }[] = [
    { key: "students", label: "Учні" },
    { key: "conducted_lessons", label: "Уроки" },
    { key: "teachers", label: "Вчителі" },
    { key: "clubs", label: "Гуртки" },
    { key: "schedules", label: "Розклад" },
    { key: "audit_logs", label: "Аудит" },
  ];

  const s = (row: Record<string, unknown>, key: string) => {
    const v = row[key];
    return v == null || v === "" ? "—" : String(v);
  };

  function renderTable() {
    if (!data) return null;
    const rows = data.sections[tab] ?? [];
    if (rows.length === 0) return <div className="table-empty">Немає даних</div>;
    const cols: { h: string; render: (r: Record<string, unknown>) => string }[] =
      tab === "students" ? [
        { h: "ID", render: (r) => s(r, "id") },
        { h: "ПІБ", render: (r) => `${s(r, "last_name")} ${s(r, "first_name")}` },
        { h: "Народження", render: (r) => s(r, "birth_date") },
        { h: "Клас", render: (r) => s(r, "grade") },
        { h: "Телефон", render: (r) => s(r, "phone_child") },
      ] : tab === "conducted_lessons" ? [
        { h: "ID", render: (r) => s(r, "id") },
        { h: "Дата", render: (r) => s(r, "lesson_date").slice(0, 16).replace("T", " ") },
        { h: "Гурток", render: (r) => s(r, "club_name") },
        { h: "Вчитель", render: (r) => s(r, "teacher_name") },
        { h: "Присутність", render: (r) => `${s(r, "present_students")}/${s(r, "total_students")}` },
      ] : tab === "teachers" ? [
        { h: "ID", render: (r) => s(r, "id") },
        { h: "Повне ім'я", render: (r) => s(r, "full_name") },
        { h: "Chat ID", render: (r) => s(r, "tg_chat_id") },
        { h: "Активний", render: (r) => (r["active"] ? "Так" : "Ні") },
      ] : tab === "clubs" ? [
        { h: "ID", render: (r) => s(r, "id") },
        { h: "Назва", render: (r) => s(r, "name") },
        { h: "Тривалість", render: (r) => `${s(r, "duration_min")} хв` },
        { h: "Локація", render: (r) => s(r, "location") },
      ] : tab === "schedules" ? [
        { h: "ID", render: (r) => s(r, "id") },
        { h: "День", render: (r) => s(r, "weekday") },
        { h: "Час", render: (r) => s(r, "start_time") },
        { h: "Гурток", render: (r) => s(r, "club_name") },
        { h: "Вчитель", render: (r) => s(r, "teacher_name") },
      ] : [
        { h: "ID", render: (r) => s(r, "id") },
        { h: "Час", render: (r) => s(r, "timestamp").slice(0, 16).replace("T", " ") },
        { h: "Користувач", render: (r) => s(r, "user_name") },
        { h: "Тип", render: (r) => s(r, "action_type") },
        { h: "Опис", render: (r) => s(r, "description") },
      ];
    return (
      <div className="table-scroll" style={{ maxHeight: "42vh", overflowY: "auto" }}>
        <table className="dtable" style={{ minWidth: 0 }}>
          <thead><tr>{cols.map((c) => <th key={c.h}>{c.h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ cursor: "default" }}>
                {cols.map((c) => <td key={c.h}>{c.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {data.counts[tab] > rows.length && (
          <div className="table-empty" style={{ padding: 12 }}>
            Показано перші {rows.length} записів з {formatNumber(data.counts[tab])}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Архів: {archive.name}</h3>
          <button className="close" aria-label="Закрити" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {content.isLoading && <EmptyState title="Читаємо архів…" />}
          {data && (
            <>
              <div className="metric-strip" style={{ marginBottom: 14 }}>
                {Object.entries(data.counts).map(([key, count]) => (
                  <div key={key}><b>{formatNumber(count)}</b><span>{COUNT_LABELS[key] ?? key}</span></div>
                ))}
              </div>
              <div className="seg" style={{ display: "inline-flex", marginBottom: 12 }}>
                {TABS.map((t) => (
                  <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
              {renderTable()}
            </>
          )}
        </div>
        <div className="modal-foot">
          <a className="btn ghost" href={archiveApi.downloadUrl(archive.id)}><IconDownload />Завантажити ZIP</a>
          <button className="btn" onClick={onClose}>Закрити</button>
        </div>
      </div>
    </div>
  );
}

export function ArchivePage() {
  const qc = useQueryClient();
  const archives = useQuery(archiveQueries.list());
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewing, setViewing] = useState<ArchiveItem | null>(null);
  const [restoring, setRestoring] = useState<ArchiveItem | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [deleting, setDeleting] = useState<ArchiveItem | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidateAll = () => {
    // Відновлення/очищення міняє ВСІ дані — скидаємо весь кеш
    qc.invalidateQueries();
  };

  const restore = useMutation({
    mutationFn: (id: number) => archiveApi.restore(id),
    onSuccess: (res) => {
      invalidateAll();
      setRestoring(null);
      setRestoreConfirmText("");
      const total = Object.values(res.restored ?? {}).reduce((a, b) => a + b, 0);
      setActionOk(`Базу відновлено з архіву (${formatNumber(total)} записів).`);
    },
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Не вдалося відновити базу"),
  });

  const remove = useMutation({
    mutationFn: (id: number) => archiveApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archives"] });
      setDeleting(null);
    },
    onError: (err) =>
      setActionError(err instanceof ApiError ? err.message : "Не вдалося видалити архів"),
  });

  const upload = useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) => archiveApi.upload(file, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archives"] });
      setUploadOpen(false);
      setUploadName("");
    },
    onError: (err) =>
      setActionError(err instanceof Error ? err.message : "Не вдалося завантажити архів"),
  });

  const q = search.trim().toLowerCase();
  const rows = (archives.data ?? []).filter((a) => !q || a.name.toLowerCase().includes(q));

  return (
    <PageShell
      title="Архів"
      subtitle={archives.data ? `${formatNumber(archives.data.length)} архівів системи` : "Завантаження…"}
      actions={
        <span style={{ display: "flex", gap: 10 }}>
          <button className="btn ghost" onClick={() => setUploadOpen(true)}><IconUpload />Завантажити ZIP</button>
          <button className="btn" onClick={() => setCreateOpen(true)}><IconPlus />Створити архів</button>
        </span>
      }
    >
      {actionError && (
        <div className="form-error" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{actionError}</span>
          <button className="link" onClick={() => setActionError(null)}>Закрити</button>
        </div>
      )}
      {actionOk && (
        <div className="form-ok" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{actionOk}</span>
          <button className="link" onClick={() => setActionOk(null)}>Закрити</button>
        </div>
      )}

      <DataToolbar>
        <div className="tsearch">
          <IconSearch />
          <input placeholder="Пошук за назвою…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </DataToolbar>

      {archives.isLoading && <EmptyState title="Завантажуємо архіви…" />}
      {!archives.isLoading && rows.length === 0 && (
        <EmptyState title={q ? "Нічого не знайдено" : "Архівів ще немає"}>
          {q ? "Змініть пошук" : "Створіть архів перед закриттям навчального року"}
        </EmptyState>
      )}

      {rows.length > 0 && (
        <div className="table-card">
          <div className="table-scroll">
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Назва</th>
                  <th>Створено</th>
                  <th>Автор</th>
                  <th style={{ minWidth: 220 }}>Вміст</th>
                  <th>Очищення</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} onClick={() => setViewing(a)} title="Натисніть для перегляду вмісту">
                    <td><div className="cell-name">{a.name}</div></td>
                    <td className="tnum-cell">{formatUpdatedAt(a.created_at)}</td>
                    <td>{a.created_by_name ?? "—"}</td>
                    <td>
                      <div className="cell-sub" style={{ marginTop: 0 }}>
                        {Object.entries(a.counts)
                          .filter(([, n]) => n > 0)
                          .slice(0, 4)
                          .map(([key, n]) => `${COUNT_LABELS[key] ?? key}: ${formatNumber(n)}`)
                          .join(" · ") || "—"}
                      </div>
                    </td>
                    <td>
                      {a.wipe_type && a.wipe_type !== "none" ? (
                        <StatusTag tone="delete">{a.wipe_type === "full" ? "повне" : "часткове"}</StatusTag>
                      ) : (
                        <span className="cell-muted">без очищення</span>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <a className="row-btn" title="Завантажити ZIP" href={archiveApi.downloadUrl(a.id)}>
                          <IconDownload />
                        </a>
                        <button
                          className="row-btn"
                          title="Відновити базу з цього архіву"
                          onClick={() => { setRestoreConfirmText(""); setRestoring(a); }}
                        >
                          <IconRestore />
                        </button>
                        <button className="row-btn danger" title="Видалити архів" onClick={() => setDeleting(a)}>
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} />}
      {viewing && <ViewModal archive={viewing} onClose={() => setViewing(null)} />}

      {/* Відновлення: подвійне підтвердження, як у legacy */}
      {restoring && (
        <div className="modal-overlay" onClick={() => setRestoring(null)}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Відновити базу з архіву?</h3>
              <button className="close" aria-label="Закрити" onClick={() => setRestoring(null)}><IconClose /></button>
            </div>
            <div className="modal-body">
              <div className="form-error">
                УВАГА! Поточні дані буде замінено вмістом архіву <b>{restoring.name}</b>.
                Цю дію не можна скасувати.
              </div>
              <div className="field">
                <label htmlFor="restore-confirm">Введіть слово <b>ВІДНОВИТИ</b> для підтвердження</label>
                <input
                  id="restore-confirm"
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder="ВІДНОВИТИ"
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn secondary" onClick={() => setRestoring(null)}>Скасувати</button>
              <button
                className="btn danger"
                disabled={restoreConfirmText.trim().toUpperCase() !== "ВІДНОВИТИ" || restore.isPending}
                onClick={() => restore.mutate(restoring.id)}
              >
                {restore.isPending ? "Відновлюємо…" : "Відновити базу"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Видалити архів?</h3>
              <button className="close" aria-label="Закрити" onClick={() => setDeleting(null)}><IconClose /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
                Архів <b>{deleting.name}</b> і його файл буде видалено назавжди.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn secondary" onClick={() => setDeleting(null)}>Скасувати</button>
              <button className="btn danger" disabled={remove.isPending} onClick={() => remove.mutate(deleting.id)}>
                {remove.isPending ? "Видаляємо…" : "Видалити"}
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadOpen && (
        <div className="modal-overlay" onClick={() => setUploadOpen(false)}>
          <div className="modal-card narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Завантажити архів (ZIP)</h3>
              <button className="close" aria-label="Закрити" onClick={() => setUploadOpen(false)}><IconClose /></button>
            </div>
            <div className="modal-body">
              <div className="fgrid">
                <div className="field span-12">
                  <label htmlFor="u-name">Назва архіву *</label>
                  <input id="u-name" value={uploadName} onChange={(e) => setUploadName(e.target.value)} required />
                </div>
                <div className="field span-12">
                  <label htmlFor="u-file">Файл .zip *</label>
                  <input id="u-file" ref={fileRef} type="file" accept=".zip" style={{ fontSize: 13 }} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn secondary" onClick={() => setUploadOpen(false)}>Скасувати</button>
              <button
                className="btn"
                disabled={upload.isPending}
                onClick={() => {
                  const file = fileRef.current?.files?.[0];
                  if (!file) return setActionError("Оберіть .zip файл");
                  if (!uploadName.trim()) return setActionError("Вкажіть назву архіву");
                  upload.mutate({ file, name: uploadName.trim() });
                }}
              >
                {upload.isPending ? "Завантажуємо…" : "Завантажити"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
