import { formatNumber, pluralUk } from "../../lib/format";
import { IconAlert, IconCheck } from "../../lib/icons";
import { ANOMALY_LABELS, UNMARKED_LESSON, type AnomalyPage, type AttentionItem, type AttentionReport, type MainBranchKpi } from "./api";
import { countLessons, type Panel } from "./metrics";

/** Картками — лише кілька сигналів (бриф §3 Б), решта за «Усі сигнали …». */
const SHOWN_NOW = 2;
const SHOWN_PERIOD = 4;

interface Props {
  today: MainBranchKpi | undefined;
  unmarked: AnomalyPage | undefined;
  attention: AttentionReport | undefined;
  periodAttention: AttentionReport | undefined;
  days: number;
  periodLabel: string;
  loading: boolean;
  /** Хоч один із запитів «На зараз» не вдався — замість спокійного «Усе відмічено» показуємо помилку. */
  error: boolean;
  periodLoading: boolean;
  periodError: boolean;
  onOpen: (panel: Panel) => void;
  onRetry: () => void;
}

interface Card { tone: "warn" | "risk" | "info"; tag: string; title: string; sub: string; panel: Panel }

const isRisk = (it: AttentionItem) => it.severity === "critical" || it.severity === "high";
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** Той самий сигнал у двох вікнах («На зараз» і «За період») показуємо один раз. */
const keyOf = (it: AttentionItem) => `${it.tenant_id}|${it.anomaly_type}|${it.lesson_date ?? ""}|${it.summary}`;

/** Один вигляд картки для обох груп: тег — важливість, жирним — що сталося (і де), підрядок — деталі. */
function signalCard(it: AttentionItem, scope: Panel["scope"]): Card {
  return {
    tone: isRisk(it) ? "risk" : "warn",
    tag: isRisk(it) ? "Ризик" : "Увага",
    title: `${it.tenant_name}: ${lower(ANOMALY_LABELS[it.anomaly_type] ?? it.anomaly_type)}`,
    sub: it.summary,
    panel: { kind: it.anomaly_type === "ATTENDANCE_DROP" ? "attendance" : "attention", branch: it.tenant_id, scope },
  };
}

/** Права колонка «Події» (як стрічка Activity на референсі): спершу «На зараз» — уся мережа за останні
    `days` днів, незалежно від обраного періоду; нижче — сигнали за обраний період, яких ще немає зверху.
    Кожна картка — кнопка у свою вибірку в бічній панелі. */
export function EventsFeed({ today, unmarked, attention, periodAttention, days, periodLabel, loading, error, periodLoading, periodError, onOpen, onRetry }: Props) {
  const unmarkedTotal = unmarked?.page.total ?? 0;
  const unmarkedBranches = new Set((unmarked?.rows ?? []).map((r) => r.tenant_id)).size;
  const others = (attention?.items ?? []).filter((it) => it.anomaly_type !== UNMARKED_LESSON);
  const nowTotal = attention?.totals.total ?? 0;

  const now: Card[] = [];
  if (unmarkedTotal > 0) {
    now.push({
      tone: "warn", tag: "Увага", title: `${countLessons(unmarkedTotal)} не відмічено`,
      sub: `${formatNumber(unmarkedBranches)} ${pluralUk(unmarkedBranches, "філія", "філії", "філій")} · відмітити у філії`,
      panel: { kind: "unmarked", branch: null, scope: "now" },
    });
  }
  for (const it of others.slice(0, SHOWN_NOW)) now.push(signalCard(it, "now"));
  const nowHidden = Math.max(0, others.length - SHOWN_NOW);
  // «Усе відмічено» — лише коли обидва джерела справді завантажено й порожні, а не коли даних немає.
  const calmNow = Boolean(unmarked && attention) && unmarkedTotal === 0 && others.length === 0;
  const scheduled = today?.lessons_scheduled ?? 0;
  const todayCard: Card | null = today ? {
    tone: "info", tag: "Сьогодні",
    title: scheduled > 0 ? `${countLessons(scheduled)} за розкладом` : "Уроків немає",
    sub: scheduled > 0 ? `${formatNumber(today.lessons_completed)} проведено` : "за розкладом на сьогодні нічого",
    panel: { kind: "today", branch: null, scope: "now" },
  } : null;

  // За період — лише те, чого немає в «На зараз»; невідмічені згорнуто по філіях.
  const nowKeys = new Set((attention?.items ?? []).map(keyOf));
  const fresh = (periodAttention?.items ?? []).filter((it) => !nowKeys.has(keyOf(it)));
  const period: Card[] = [];
  const unmarkedByTenant = new Map<number, { name: string; n: number }>();
  for (const it of fresh) {
    if (it.anomaly_type === UNMARKED_LESSON) {
      const cur = unmarkedByTenant.get(it.tenant_id) ?? { name: it.tenant_name, n: 0 };
      unmarkedByTenant.set(it.tenant_id, { name: cur.name, n: cur.n + 1 });
    } else {
      period.push(signalCard(it, "period"));
    }
  }
  for (const [id, x] of unmarkedByTenant) {
    period.push({
      tone: "warn", tag: "Увага", title: `${x.name}: ${countLessons(x.n)} не відмічено`, sub: "за період · відмітити у філії",
      panel: { kind: "unmarked", branch: id, scope: "period" },
    });
  }
  const periodTotal = periodAttention?.totals.total ?? 0;
  const periodSame = periodTotal - fresh.length;

  return (
    <aside className="nd-feed" aria-labelledby="nd-feed-title">
      <h3 id="nd-feed-title" className="nd-feed-title">Події</h3>

      <section className="nd-feed-group" aria-labelledby="nd-feed-now">
        <h4 id="nd-feed-now" className="nd-feed-sub">На зараз <span>уся мережа · {formatNumber(days)} {pluralUk(days, "день", "дні", "днів")}</span></h4>
        {loading ? (
          <div className="nd-feed-list"><span className="nd-skel" style={{ height: 64 }} /><span className="nd-skel" style={{ height: 64 }} /></div>
        ) : (
          <div className="nd-feed-list">
            {error && <ErrorCard what="Частину сигналів не завантажено" onRetry={onRetry} />}
            {calmNow && (
              <div className="nd-ev ok"><IconCheck /><b>Усе відмічено</b><span className="nd-ev-sub">сигналів немає</span></div>
            )}
            {now.map((c, i) => <EventCard key={i} card={c} onOpen={onOpen} />)}
            {nowHidden > 0 && (
              <button type="button" className="nd-feed-all" onClick={() => onOpen({ kind: "attention", branch: null, scope: "now" })}>
                Усі сигнали зараз ({formatNumber(nowTotal)}) →
              </button>
            )}
            {todayCard && <EventCard card={todayCard} onOpen={onOpen} />}
          </div>
        )}
      </section>

      <section className="nd-feed-group" aria-labelledby="nd-feed-period">
        <h4 id="nd-feed-period" className="nd-feed-sub">За період <span>{periodLabel}</span></h4>
        {periodLoading && !periodAttention ? (
          <div className="nd-feed-list"><span className="nd-skel" style={{ height: 64 }} /></div>
        ) : !periodAttention ? (
          periodError
            ? <ErrorCard what="Сигнали за період не завантажено" onRetry={onRetry} />
            : <p className="nd-feed-note">Сигнали за період недоступні</p>
        ) : periodTotal === 0 ? (
          <div className="nd-ev ok"><IconCheck /><b>Усе спокійно</b><span className="nd-ev-sub">за період сигналів немає</span></div>
        ) : (
          <div className="nd-feed-list">
            {period.slice(0, SHOWN_PERIOD).map((c, i) => <EventCard key={i} card={c} onOpen={onOpen} />)}
            {period.length === 0 && periodSame > 0 && (
              <p className="nd-feed-note">
                Ті самі {formatNumber(periodSame)} {pluralUk(periodSame, "сигнал", "сигнали", "сигналів")}, що в «На зараз», — нових за період немає
              </p>
            )}
            {(period.length > SHOWN_PERIOD || periodTotal > period.length) && (
              <button type="button" className="nd-feed-all" onClick={() => onOpen({ kind: "attention", branch: null, scope: "period" })}>
                Усі сигнали за період ({formatNumber(periodTotal)}) →
              </button>
            )}
          </div>
        )}
      </section>
    </aside>
  );
}

function EventCard({ card, onOpen }: { card: Card; onOpen: (panel: Panel) => void }) {
  return (
    <button type="button" className={`nd-ev ${card.tone}`} onClick={() => onOpen(card.panel)}>
      <span className="nd-ev-tag">{card.tag}</span>
      <b>{card.title}</b>
      <span className="nd-ev-sub">{card.sub}</span>
      <span className="nd-ev-go" aria-hidden="true">→</span>
    </button>
  );
}

/** Помилка запиту — не «фальшивий нуль»: кажемо, що не завантажено, і даємо повторити. */
function ErrorCard({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="nd-ev ok err" role="status">
      <IconAlert />
      <b>{what}</b>
      <span className="nd-ev-sub"><button type="button" className="link" onClick={onRetry}>Спробувати ще</button></span>
    </div>
  );
}
