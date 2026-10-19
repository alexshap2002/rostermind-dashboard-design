/** «Що далі?»: кнопка в шапці й бічна панель — від порожнього закладу до робочого. */
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMutation, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { formatLessonMomentUk } from "../../lib/format";
import {
  IconAlert, IconBell, IconCalendar, IconCard, IconCheck, IconClose, IconClubs, IconInfo,
  IconSend, IconSparkle, IconStudents, IconTeacher,
} from "../../lib/icons";
import { useModalAccessibility } from "../../components/admin/useModalAccessibility";
import { dashboardQueries } from "../dashboard/api";
import { onboardingApi, onboardingQueries, type WnIssue, type WnStatus, type WnStep } from "./api";
import { INTRO, ISSUES, SEVERITY_LABEL, STEPS, SUPPORT_NICK, SUPPORT_URL } from "./content";

const AUTO_OPEN_KEY = "rm.whatnext.auto";
// Коло радіусом 15 від 12-ї години: кільце заповнюється без rotate,
// який глобальне правило «менше руху» гасить разом з анімаціями.
const RING = "M18 3a15 15 0 1 1 0 30a15 15 0 1 1 0-30";

const STEP_ICONS: Record<string, typeof IconClubs> = {
  clubs: IconClubs,
  teachers: IconSend,
  students: IconStudents,
  schedules: IconCalendar,
  enrollments: IconStudents,
  pay_rates: IconCard,
  admin_telegram: IconBell,
  teacher_reminders: IconBell,
};

/** Скинути «вже показували», щоб наступний власник у цій вкладці теж побачив привітання. */
export function forgetWhatNextAutoOpen() {
  try {
    sessionStorage.removeItem(AUTO_OPEN_KEY);
  } catch {
    /* сховище недоступне */
  }
}

export interface WhatNextState {
  open: boolean;
  openPanel: () => void;
  close: () => void;
  status: UseQueryResult<WnStatus>;
}

export function useWhatNext(enabled: boolean): WhatNextState {
  const [open, setOpen] = useState(false);
  const status = useQuery({ ...onboardingQueries.status(), enabled });
  const summary = useQuery({ ...dashboardQueries.summary(), enabled });
  const { pathname } = useLocation();

  // Порожній заклад — відкриваємо самі, раз за сесію вкладки: власник заходить
  // на тест, потім передає обліковку — і новий власник теж побачить привітання.
  useEffect(() => {
    const s = summary.data;
    if (!enabled || pathname !== "/" || !s || s.stats.students > 0 || s.stats.teachers > 0) return;
    try {
      if (sessionStorage.getItem(AUTO_OPEN_KEY) === s.tenant.slug) return;
      sessionStorage.setItem(AUTO_OPEN_KEY, s.tenant.slug);
    } catch {
      /* приватний режим — просто без пам'яті */
    }
    setOpen(true);
  }, [enabled, pathname, summary.data]);

  const { refetch } = status;
  const openPanel = useCallback(() => {
    setOpen(true);
    // Вчителі реєструються в боті, поза SPA, — тож перепитуємо при кожному відкритті.
    void refetch({ cancelRefetch: false });
  }, [refetch]);
  const close = useCallback(() => setOpen(false), []);
  return { open, openPanel, close, status };
}

function progress(data: WnStatus | undefined) {
  const steps = data?.steps ?? [];
  const done = steps.filter((s) => s.done).length;
  const total = steps.length || 6;
  const critical = data?.issues.some((i) => i.severity === "critical") ?? false;
  // «Усе чітко» — лише без критичних і без «увага»: вимкнена відмітка в усіх
  // заняттях — це «увага», але бот тоді не надсилає нічого.
  const warning = data?.issues.some((i) => i.severity === "warning") ?? false;
  const complete = Boolean(data && done === total && !critical && !warning && !data.partial);
  return { done, total, critical, warning, complete };
}

function Ring({ value }: { value: number }) {
  return (
    <svg className="wn-ring" viewBox="0 0 36 36" aria-hidden="true">
      <path className="wn-ring-track" d={RING} />
      <path
        className="wn-ring-fill"
        d={RING}
        pathLength={100}
        strokeDasharray="100"
        strokeDashoffset={100 - Math.round(value * 100)}
      />
    </svg>
  );
}

export function WhatNextButton({ state }: { state: WhatNextState }) {
  const data = state.status.data;
  const { done, total, critical, warning, complete } = progress(data);
  // Усі 6 кроків пройдено — кнопка стискається до значка, щоб не муляла очі;
  // про проблеми далі скаже крапка (критично — малинова й «дихає», увага — золота).
  const compact = Boolean(data) && done === total;
  const label = `Що далі? Виконано ${done} з ${total}${critical || warning ? ", є проблеми" : ""}`;
  return (
    <button
      type="button"
      className={`wn-btn${compact ? " compact" : ""}${complete ? " calm" : ""}${critical ? " alert" : ""}`}
      onClick={state.openPanel}
      aria-haspopup="dialog"
      aria-expanded={state.open}
      aria-label={label}
      title={label}
    >
      <span className="wn-btn-ic">
        <Ring value={done / total} />
        {complete ? <IconCheck /> : <IconSparkle />}
      </span>
      {!compact && <span className="wn-btn-label">Що далі?</span>}
      {data && !compact && <span className="wn-btn-count tnum">{done}/{total}</span>}
      {(critical || warning) && <span className={`wn-dot${critical ? "" : " warn"}`} />}
    </button>
  );
}

function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function StepRow({ step, index, state, onNavigate }: {
  step: WnStep;
  index: number;
  state: "done" | "current" | "todo";
  onNavigate: () => void;
}) {
  const copy = STEPS[step.key];
  if (!copy) return null;
  const Icon = STEP_ICONS[step.key] ?? IconSparkle;
  return (
    <li className={`wn-step ${state}`}>
      <span className="wn-badge" aria-hidden="true">
        {state === "done" ? <IconCheck className="wn-check" /> : index}
      </span>
      <div className="wn-step-main">
        <div className="wn-step-t">
          {copy.title}
          {copy.tag && <span className="wn-tag">{copy.tag}</span>}
          <span className="sr-only">
            {state === "done" ? " — зроблено" : state === "current" ? " — наступний крок" : ""}
          </span>
        </div>
        {state === "done" && <div className="wn-step-s">{copy.done(step.count)}</div>}
        {state === "current" && (
          <>
            <p className="wn-step-p">{copy.text}</p>
            <div className="wn-step-acts">
              <Link className="btn" to={copy.cta.to} onClick={onNavigate}>
                <Icon />
                <span>{copy.cta.label}</span>
              </Link>
              {copy.extra && (
                <Link className="btn ghost" to={copy.extra.to} onClick={onNavigate}>
                  <span>{copy.extra.label}</span>
                </Link>
              )}
            </div>
          </>
        )}
      </div>
      {state === "todo" && (
        <Link className="link wn-step-go" to={copy.cta.to} onClick={onNavigate} title={copy.text}>
          {copy.cta.label} →
        </Link>
      )}
    </li>
  );
}

function IssueCard({ issue, onNavigate }: { issue: WnIssue; onNavigate: () => void }) {
  const copy = ISSUES[issue.key];
  if (!copy) return null;
  const Icon = issue.severity === "info" ? IconInfo : IconAlert;
  const shown = issue.examples.slice(0, 4);
  const more = issue.count - shown.length;
  return (
    <li className={`wn-issue ${issue.severity}`}>
      <span className="wn-issue-ic" aria-hidden="true">
        <Icon />
      </span>
      <div className="wn-issue-main">
        <div className="wn-issue-t">
          {copy.title}
          <span className="wn-sev">{SEVERITY_LABEL[issue.severity]}</span>
        </div>
        <p>{copy.text}</p>
        <ul className="wn-ex">
          {shown.map((example, i) => (
            <li key={i}>{example}</li>
          ))}
          {more > 0 && <li className="more">і ще {more}</li>}
        </ul>
        {(copy.action || copy.support) && (
          <div className="wn-issue-acts">
            {copy.action && (
              <Link className="btn ghost sm" to={copy.action.to} onClick={onNavigate}>
                {copy.action.label}
              </Link>
            )}
            {copy.support && (
              <a className="link" href={SUPPORT_URL} target="_blank" rel="noreferrer">
                Написати адміністратору
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function testError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Не вдалося надіслати.";
  if (error.status === 409) return "У цього вчителя немає Telegram.";
  if (error.status === 502) return "Telegram не прийняв повідомлення — можливо, вчитель заблокував бота.";
  if (error.status === 400) return "Спершу збережіть свій chat ID у «Сповіщеннях адміністратору».";
  if (error.status === 403) return "План закладу не має сповіщень у Telegram.";
  return error.message || "Не вдалося надіслати.";
}

function AutomationCheck({ data, onNavigate }: { data: WnStatus; onNavigate: () => void }) {
  const admin = data.optional_steps.find((s) => s.key === "admin_telegram");
  const canTestTeachers = data.optional_steps.some((s) => s.key === "teacher_reminders");
  const teachers = data.telegram_teachers;
  const [teacherId, setTeacherId] = useState<number | undefined>(teachers[0]?.id);
  const [confirming, setConfirming] = useState(false);
  const adminTest = useMutation({ mutationFn: onboardingApi.testAdmin });
  const teacherTest = useMutation({
    mutationFn: onboardingApi.testTeacher,
    onSettled: () => setConfirming(false),
  });
  const teacherName = teachers.find((t) => t.id === teacherId)?.name;
  const next = data.next_lesson;
  const recent = data.recent;

  return (
    <div className="wn-auto">
      <div className="wn-auto-row">
        <span className="wn-auto-ic" aria-hidden="true"><IconCalendar /></span>
        <div className="wn-auto-main">
          <div className="wn-auto-t">Найближча відмітка</div>
          {next ? (
            <div className="wn-auto-s">
              <b>{formatLessonMomentUk(next.notify_at)}</b> — {next.club ?? "Заняття"}
              {next.group ? ` · ${next.group}` : ""}.{" "}
              {next.teachers_only && "Лише відмітка вчителів. "}
              Отримають:{" "}
              {next.recipients.length
                ? next.recipients.map((r) => (r.telegram ? r.name : `${r.name} (без Telegram)`)).join(", ")
                : "нікому"}
            </div>
          ) : (
            <div className="wn-auto-s">Найближчим часом відміток немає.</div>
          )}
        </div>
      </div>

      {recent && (
        <div className="wn-stats">
          <div><b className="num">{recent.sent}</b><span>надіслано за 7 днів</span></div>
          <div><b className="num">{recent.completed}</b><span>завершено вчителями</span></div>
          <div><b className="num">{recent.missed + recent.failed}</b><span>не дійшло</span></div>
        </div>
      )}

      {admin && (
        <div className="wn-auto-row">
          <span className="wn-auto-ic" aria-hidden="true"><IconBell /></span>
          <div className="wn-auto-main">
            <div className="wn-auto-t">Сповіщення собі</div>
            {admin.chat ? (
              <>
                <div className="wn-auto-s">Тестове повідомлення прийде у ваш Telegram.</div>
                <div className="wn-auto-acts">
                  <button
                    type="button"
                    className="btn sm"
                    disabled={adminTest.isPending}
                    onClick={() => adminTest.mutate()}
                  >
                    <IconSend />
                    <span>{adminTest.isPending ? "Надсилаємо…" : "Надіслати тест собі"}</span>
                  </button>
                  {adminTest.isSuccess && <span className="wn-res ok">Надіслано — перевірте Telegram</span>}
                  {adminTest.isError && <span className="wn-res err">{testError(adminTest.error)}</span>}
                </div>
              </>
            ) : (
              <div className="wn-auto-s">
                Chat ID ще не збережено.{" "}
                <Link className="link" to="/telegram-notifications" onClick={onNavigate}>Налаштувати</Link>
              </div>
            )}
          </div>
        </div>
      )}

      {canTestTeachers && teachers.length > 0 && (
        <div className="wn-auto-row">
          <span className="wn-auto-ic" aria-hidden="true"><IconTeacher /></span>
          <div className="wn-auto-main">
            <div className="wn-auto-t">Перевірити вчителя</div>
            <div className="wn-auto-s">
              {confirming && teacherName
                ? `${teacherName} отримає справжнє повідомлення в Telegram.`
                : "Вибраний вчитель отримає «Тестове сповіщення вчителю»."}
            </div>
            <div className="wn-auto-acts">
              <select
                className="tselect"
                aria-label="Вчитель для тестового повідомлення"
                value={teacherId}
                onChange={(e) => {
                  setTeacherId(Number(e.target.value));
                  setConfirming(false);
                  teacherTest.reset();
                }}
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button
                type="button"
                className={`btn sm${confirming ? "" : " ghost"}`}
                disabled={teacherTest.isPending || teacherId === undefined}
                onClick={() => {
                  if (!confirming) return setConfirming(true);
                  if (teacherId !== undefined) teacherTest.mutate(teacherId);
                }}
              >
                <span>{teacherTest.isPending ? "Надсилаємо…" : confirming ? "Так, надіслати" : "Надіслати тест"}</span>
              </button>
              {confirming && !teacherTest.isPending && (
                <button type="button" className="link" onClick={() => setConfirming(false)}>Скасувати</button>
              )}
            </div>
            {teacherTest.isSuccess && <span className="wn-res ok">Надіслано — хай вчитель перевірить Telegram</span>}
            {teacherTest.isError && <span className="wn-res err">{testError(teacherTest.error)}</span>}
          </div>
        </div>
      )}

      <p className="wn-hint">
        Або попросіть вчителя натиснути в боті «Уроки сьогодні» — бот покаже його уроки на сьогодні.
      </p>
    </div>
  );
}

export function WhatNextPanel({ state }: { state: WhatNextState }) {
  const { dialogRef, titleId } = useModalAccessibility<HTMLElement>(state.close);
  const { data, isLoading, isError, refetch } = state.status;
  const p = progress(data);
  const current = data?.steps.find((s) => !s.done)?.key;
  const hasSchedules = data?.steps.find((s) => s.key === "schedules")?.done ?? false;
  const coreReady = data ? data.steps.slice(0, 5).every((s) => s.done) : false; // кроки 1–5
  const needsAdmin = Boolean(data && (data.partial || data.issues.some((i) => ISSUES[i.key]?.support)));

  let subtitle = "Перевіряємо заклад…";
  if (data) {
    if (p.complete) subtitle = "Усе чітко! Заклад налаштований і працює.";
    else if (p.done === 0) subtitle = "Вітаємо в RosterMind! Кілька кроків — і бот сам розсилатиме вчителям списки дітей.";
    else if (current && STEPS[current]) subtitle = `Наступний крок: ${lowerFirst(STEPS[current].title)}.`;
    else subtitle = "Залишилося розібратися з проблемами нижче.";
  }

  return (
    <div className="wn-overlay" onMouseDown={(e) => e.target === e.currentTarget && state.close()}>
      <aside
        className="wn-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className={`wn-hero${p.complete ? " complete" : ""}`}>
          <div className="wn-hero-ring">
            <Ring value={data ? p.done / p.total : 0} />
            <span className="wn-hero-num num">
              {p.complete ? <IconCheck className="wn-check" /> : <>{p.done}<small>з {p.total}</small></>}
            </span>
          </div>
          <div className="wn-hero-copy">
            <div className="wn-eyebrow">Налаштування закладу</div>
            <h3 id={titleId}>Що далі?</h3>
            <p>{subtitle}</p>
          </div>
          <button type="button" className="wn-close" aria-label="Закрити" onClick={state.close}>
            <IconClose />
          </button>
        </header>

        <div className="wn-body">
          {isLoading && (
            <div className="wn-skeleton" aria-hidden="true">
              <div className="sk" /><div className="sk" /><div className="sk" /><div className="sk" />
            </div>
          )}
          {isError && !data && (
            <div className="wn-issue critical wn-error">
              <span className="wn-issue-ic" aria-hidden="true"><IconAlert /></span>
              <div className="wn-issue-main">
                <div className="wn-issue-t">Не вдалося перевірити заклад</div>
                <div className="wn-issue-acts">
                  <button type="button" className="btn ghost sm" onClick={() => void refetch()}>Спробувати ще</button>
                  <a className="link" href={SUPPORT_URL} target="_blank" rel="noreferrer">Написати адміністратору</a>
                </div>
              </div>
            </div>
          )}
          {data && (
            <>
              <details className="wn-intro" open={!p.complete}>
                <summary>Як це працює</summary>
                <p>{INTRO.text}</p>
                <ol className="wn-flow">
                  {INTRO.flow.map((text, i) => (
                    <li key={i}><span className="wn-flow-n num">{i + 1}</span>{text}</li>
                  ))}
                </ol>
              </details>

              <div className="fsection">Кроки</div>
              <ol className="wn-steps">
                {data.steps.map((step, i) => (
                  <StepRow
                    key={step.key}
                    step={step}
                    index={i + 1}
                    state={step.done ? "done" : step.key === current ? "current" : "todo"}
                    onNavigate={state.close}
                  />
                ))}
                {data.optional_steps.map((step, i) => (
                  <StepRow
                    key={step.key}
                    step={step}
                    index={data.steps.length + i + 1}
                    state={step.done ? "done" : "todo"}
                    onNavigate={state.close}
                  />
                ))}
              </ol>

              <div className="fsection">Перевірка</div>
              {needsAdmin && (
                <div className="wn-support">
                  <IconSend />
                  <span>
                    {data.partial
                      ? "Не всі перевірки вдалося виконати. "
                      : "Схоже, тут потрібна допомога адміністратора. "}
                    Напишіть {SUPPORT_NICK} — опишіть, що бачите.
                  </span>
                  <a className="btn sm" href={SUPPORT_URL} target="_blank" rel="noreferrer"><span>Написати</span></a>
                </div>
              )}
              {data.issues.length > 0 ? (
                <ul className="wn-issues">
                  {data.issues.map((issue) => (
                    <IssueCard key={issue.key} issue={issue} onNavigate={state.close} />
                  ))}
                </ul>
              ) : !hasSchedules ? (
                <div className="empty-inline">Перевірки почнуться, щойно з'явиться розклад.</div>
              ) : (
                !data.partial && <div className="wn-ok"><IconCheck /> Проблем не знайдено</div>
              )}

              {coreReady && (
                <>
                  <div className="fsection">Перевірте автоматизації</div>
                  <AutomationCheck data={data} onNavigate={state.close} />
                </>
              )}
            </>
          )}
        </div>

        <footer className="wn-foot">
          <span>Щось незрозуміло або не працює? Напишіть адміністратору RosterMind.</span>
          <a className="btn secondary" href={SUPPORT_URL} target="_blank" rel="noreferrer">
            <IconSend />
            <span>{SUPPORT_NICK}</span>
          </a>
        </footer>
      </aside>
    </div>
  );
}
