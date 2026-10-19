import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { IconClose, IconDownload } from "../../lib/icons";
import { TopNav } from "../../components/layout/TopNav";
import { ConfirmDialog } from "../../components/admin/primitives";
import { dashboardQueries } from "../dashboard/api";
import {
  registrationApi, registrationLinks, registrationQueries,
  type TeacherInviteState,
} from "./api";

const IconLink = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
);
const IconCopy = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
);

function humanError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  return fallback;
}

/** ISO (UTC) → "DD.MM.YYYY HH:MM" у локальному часі. */
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ═══════════ Запрошення вчителів ═══════════ */

function TeacherInviteCard() {
  const qc = useQueryClient();
  const invite = useQuery(registrationQueries.teacherInvite());
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<null | "rotate" | "revoke">(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["teacher-invite"] });
  const rotate = useMutation({
    mutationFn: registrationApi.createOrRotateInvite,
    onSuccess: () => { setError(null); refresh(); },
    onError: (e) => setError(humanError(e, "Не вдалося створити посилання")),
  });
  const revoke = useMutation({
    mutationFn: registrationApi.revokeInvite,
    onSuccess: () => { setError(null); refresh(); },
    onError: (e) => setError(humanError(e, "Не вдалося скасувати посилання")),
  });

  const st: TeacherInviteState | undefined = invite.data;
  const status = st?.status ?? "missing";
  const hasLink = status === "active" && !!st?.telegram_deep_link;

  async function copy() {
    if (!st?.telegram_deep_link) return;
    await navigator.clipboard.writeText(st.telegram_deep_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="rcard">
      <div className="rcard-head">
        <div>
          <h3>Посилання для реєстрації вчителів</h3>
          <p>Надішліть вчителю в Telegram — діє 24 години і прив'язує його до вашого закладу</p>
        </div>
        {status === "active" && <span className="tag create">Активне</span>}
        {status === "expired" && <span className="tag enroll">Протерміноване</span>}
        {status === "revoked" && <span className="tag delete">Скасоване</span>}
      </div>
      <div className="rcard-body">
        {error && <div className="form-error">{error}</div>}
        <div className="link-row">
          <input
            readOnly
            value={hasLink ? st!.telegram_deep_link! : ""}
            placeholder="Посилання ще не створено"
            onFocus={(e) => e.target.select()}
          />
          <button className="btn ghost" disabled={!hasLink} onClick={copy}>
            <IconCopy />{copied ? "Скопійовано!" : "Копіювати"}
          </button>
          <a
            className={`btn ghost${hasLink ? "" : " disabled"}`}
            href={hasLink ? registrationLinks.teacherInviteQr : undefined}
            aria-disabled={!hasLink}
            onClick={(e) => { if (!hasLink) e.preventDefault(); }}
          >
            <IconDownload />QR 2000×2000
          </a>
        </div>
        <div className="link-meta">
          {invite.isLoading && "Завантаження…"}
          {!invite.isLoading && status === "active" && (
            <>
              <b style={{ color: "var(--green)" }}>Активне до {fmtDateTime(st!.expires_at)}</b>
              {" · "}використано: {st!.use_count}
              {st!.last_used_at ? ` · останнє використання: ${fmtDateTime(st!.last_used_at)}` : ""}
              {st!.link_error ? <span style={{ color: "var(--gold-text)" }}> · {st!.link_error}</span> : null}
            </>
          )}
          {!invite.isLoading && status === "expired" && `Посилання протерміноване (діяло до ${fmtDateTime(st?.expires_at ?? null)}). Створіть нове.`}
          {!invite.isLoading && status === "revoked" && "Посилання скасоване. Створіть нове, коли буде потрібно."}
          {!invite.isLoading && status === "missing" && "Активного посилання немає — згенеруйте, щоб запросити вчителя."}
        </div>
        <div className="link-actions">
          <button className="btn" disabled={rotate.isPending} onClick={() => (status === "missing" ? rotate.mutate() : setConfirm("rotate"))}>
            <IconLink />
            <span>{rotate.isPending ? "Генеруємо…" : status === "missing" ? "Згенерувати посилання" : "Створити нове посилання"}</span>
          </button>
          {status === "active" && (
            <button className="btn ghost danger-ghost" disabled={revoke.isPending} onClick={() => setConfirm("revoke")}>
              <IconClose />{revoke.isPending ? "Скасовуємо…" : "Скасувати посилання"}
            </button>
          )}
        </div>
      </div>

      {confirm === "rotate" && (
        <ConfirmDialog
          title="Створити нове посилання?"
          confirmLabel="Створити нове"
          danger={false}
          pending={rotate.isPending}
          onClose={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); rotate.mutate(); }}
        >
          <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
            Поточне посилання <b>перестане працювати</b> — усі, кому ви його надсилали, більше не зможуть ним скористатися.
          </p>
        </ConfirmDialog>
      )}
      {confirm === "revoke" && (
        <ConfirmDialog
          title="Скасувати посилання?"
          confirmLabel="Скасувати посилання"
          pending={revoke.isPending}
          onClose={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); revoke.mutate(); }}
        >
          <p style={{ fontSize: 13.5, color: "var(--text-2)" }}>
            Посилання одразу <b>перестане працювати</b>. Ви зможете згенерувати нове будь-коли.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export function RegistrationPage() {
  const summary = useQuery(dashboardQueries.summary());

  const s = summary.data;
  const counts = s
    ? { students: s.stats.students, teachers: s.stats.teachers, clubs: s.stats.clubs, active_schedules: s.stats.active_schedules }
    : {};

  if (summary.error instanceof ApiError && summary.error.status === 401) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <TopNav counts={counts} user={s?.user} tenantName={s?.tenant.name} />

      <div className="content wide">
        <div className="page-head">
          <div>
            <h2>Запрошення вчителів</h2>
            <p>Персональне посилання в Telegram — вчитель заповнює коротку анкету й одразу потрапляє до вашого закладу</p>
          </div>
        </div>

        <TeacherInviteCard />
      </div>
    </>
  );
}
