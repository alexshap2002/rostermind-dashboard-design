import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { formatNumber, pluralUk } from "../../lib/format";
import { IconPencil, IconPlus, IconTrash } from "../../lib/icons";
import { ConfirmDialog, FormModal, PageError, PageShell } from "../../components/admin/primitives";
import { dashboardQueries } from "../dashboard/api";
import { criteriaApi, criteriaQueries, invalidateCriteria } from "./api";
import type { Criterion, CriteriaList } from "./types";

/** «Налаштування → Інше»: налаштування закладу, що не мають окремої сторінки. */
export function SettingsPage() {
  const summary = useQuery(dashboardQueries.summary());
  const tenant = summary.data?.tenant.name;
  return (
    <PageShell title="Інші налаштування" subtitle={tenant ? `Налаштування закладу «${tenant}»` : "Налаштування закладу"}>
      <VulnerabilityCriteriaSection />
    </PageShell>
  );
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const kids = (n: number) => `${formatNumber(n)} ${pluralUk(n, "дитина", "дитини", "дітей")}`;
/** Після «з»: «з 1 дитини», «з 3 дітей». */
const kidsFrom = (n: number) => `${formatNumber(n)} ${n % 10 === 1 && n % 100 !== 11 ? "дитини" : "дітей"}`;

function VulnerabilityCriteriaSection() {
  const qc = useQueryClient();
  const list = useQuery(criteriaQueries.list());
  const [nameModal, setNameModal] = useState<{ criterion: Criterion | null } | null>(null);
  const [deleting, setDeleting] = useState<Criterion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (data: CriteriaList) => {
    qc.setQueryData(criteriaQueries.list().queryKey, data);
    invalidateCriteria(qc);
  };
  const move = useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: "up" | "down" }) => criteriaApi.move(id, direction),
    onSuccess: (data) => { setError(null); apply(data); },
    onError: (err) => setError(errorText(err, "Не вдалося змінити порядок")),
  });
  const restore = useMutation({
    mutationFn: () => criteriaApi.restoreStandard(),
    onSuccess: (data) => { setError(null); apply(data); },
    onError: (err) => setError(errorText(err, "Не вдалося повернути стандартні")),
  });

  const data = list.data;
  const items = data?.items ?? [];
  const missing = data?.missing_standard ?? [];
  const atLimit = data ? items.length >= data.limit : false;

  return (
    <div className="rcard">
      <div className="rcard-head">
        <div>
          <h3>Критерії вразливості</h3>
          <p>
            Свій список закладу: стандартні можна перейменувати чи видалити, свої — додати. Позначки бачать лише
            власник і адміністратори — вчителям вони не потрапляють. Головна, Excel і звіти мережі показують саме цей список.
          </p>
        </div>
        <div className="crit-actions">
          {missing.length > 0 && (
            <button
              type="button"
              className="btn ghost keep-label"
              disabled={restore.isPending}
              title={missing.map((m) => m.name).join(", ")}
              onClick={() => restore.mutate()}
            >
              Повернути стандартні ({missing.length})
            </button>
          )}
          <button type="button" className="btn keep-label" disabled={atLimit} title={atLimit ? `Максимум — ${data?.limit}` : undefined} onClick={() => setNameModal({ criterion: null })}>
            <IconPlus /><span>Додати критерій</span>
          </button>
        </div>
      </div>
      <div className="rcard-body">
        {error && <div className="form-error" role="alert">{error}</div>}
        {list.error ? (
          <PageError error={list.error} onRetry={() => list.refetch()} />
        ) : list.isLoading ? (
          <div className="empty-inline">Завантаження…</div>
        ) : items.length === 0 ? (
          <div className="empty-inline">
            У закладі немає жодного критерію. Додайте свій{missing.length > 0 ? " або поверніть стандартні" : ""}.
          </div>
        ) : (
          <div className="order-list">
            {items.map((c, index) => (
              <div className="order-row" key={c.id}>
                <span className="order-num">{index + 1}</span>
                <span className="order-name">
                  {c.name}
                  {c.key && <span className="tag muted crit-std">стандартний</span>}
                </span>
                <span className="crit-count tnum">{c.students_count ? kids(c.students_count) : "нікого"}</span>
                <span className="order-moves">
                  <button type="button" className="row-btn" aria-label={`«${c.name}» вище`} disabled={index === 0 || move.isPending} onClick={() => move.mutate({ id: c.id, direction: "up" })}>↑</button>
                  <button type="button" className="row-btn" aria-label={`«${c.name}» нижче`} disabled={index === items.length - 1 || move.isPending} onClick={() => move.mutate({ id: c.id, direction: "down" })}>↓</button>
                  <button type="button" className="row-btn" aria-label={`Перейменувати «${c.name}»`} onClick={() => setNameModal({ criterion: c })}><IconPencil /></button>
                  <button type="button" className="row-btn danger" aria-label={`Видалити «${c.name}»`} onClick={() => setDeleting(c)}><IconTrash /></button>
                </span>
              </div>
            ))}
          </div>
        )}
        {data && <p className="fsection-hint crit-foot">{items.length} з {data.limit} можливих критеріїв.</p>}
      </div>

      {nameModal && (
        <CriterionNameModal criterion={nameModal.criterion} onDone={apply} onClose={() => setNameModal(null)} />
      )}
      {deleting && (
        <DeleteCriterionDialog
          criterion={deleting}
          others={items.filter((c) => c.id !== deleting.id)}
          onDone={apply}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function CriterionNameModal({
  criterion, onDone, onClose,
}: { criterion: Criterion | null; onDone: (data: CriteriaList) => void; onClose: () => void }) {
  const [name, setName] = useState(criterion?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => (criterion ? criteriaApi.rename(criterion.id, name) : criteriaApi.create(name)),
    onSuccess: (data) => { onDone(data); onClose(); },
    onError: (err) => setError(errorText(err, "Не вдалося зберегти")),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Вкажіть назву критерію");
      return;
    }
    save.mutate();
  }

  return (
    <FormModal
      title={criterion ? "Перейменувати критерій" : "Новий критерій вразливості"}
      submitLabel={criterion ? "Зберегти" : "Додати"}
      pending={save.isPending}
      error={error}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <div className="field">
        <label htmlFor="criterion-name">Назва</label>
        <input
          id="criterion-name"
          autoFocus
          maxLength={80}
          placeholder="Наприклад, «Діти з особливими освітніми потребами»"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {criterion?.key && (
        <p className="fsection-hint crit-note">
          Це стандартний критерій. Після перейменування він і далі рахується разом зі стандартними, а позначки дітей лишаються.
        </p>
      )}
    </FormModal>
  );
}

function DeleteCriterionDialog({
  criterion, others, onDone, onClose,
}: { criterion: Criterion; others: Criterion[]; onDone: (data: CriteriaList) => void; onClose: () => void }) {
  const marked = criterion.students_count;
  const [mode, setMode] = useState<"remove" | "move">("remove");
  const [target, setTarget] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: () => criteriaApi.remove(criterion.id, mode === "move" && target !== "" ? target : undefined),
    onSuccess: (data) => { onDone(data); onClose(); },
    onError: (err) => setError(errorText(err, "Не вдалося видалити")),
  });

  function onConfirm() {
    setError(null);
    if (mode === "move" && target === "") {
      setError("Оберіть критерій, куди перенести позначки");
      return;
    }
    remove.mutate();
  }

  return (
    <ConfirmDialog
      title={`Видалити «${criterion.name}»?`}
      confirmLabel={mode === "move" ? "Перенести й видалити" : "Видалити"}
      pending={remove.isPending}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      {marked === 0 ? (
        <p className="crit-text">Критерій ще ніхто не має. Він зникне зі списку, картки дитини й звітів.</p>
      ) : (
        <>
          <p className="crit-text">
            Критерій мають <b>{kids(marked)}</b>. Він зникне зі списку, картки дитини й звітів. Що зробити з позначками?
          </p>
          <label className={`check${mode === "remove" ? " on" : ""}`}>
            <input type="radio" name="crit-mode" checked={mode === "remove"} onChange={() => setMode("remove")} />
            Зняти позначку з {kidsFrom(marked)}
          </label>
          {others.length > 0 && (
            <label className={`check${mode === "move" ? " on" : ""}`}>
              <input type="radio" name="crit-mode" checked={mode === "move"} onChange={() => setMode("move")} />
              Перенести позначки в інший критерій
            </label>
          )}
          {mode === "move" && (
            <div className="field crit-target">
              <label htmlFor="crit-target">Куди перенести</label>
              <select id="crit-target" value={target} onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Оберіть критерій</option>
                {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <p className="fsection-hint crit-note">Дію не можна скасувати. Вона запишеться в «Історію змін».</p>
        </>
      )}
    </ConfirmDialog>
  );
}
