import type { ReactNode } from "react";
import { formatCurrency, formatNumber, formatPercent, pluralUk } from "../../lib/format";
import type { MainBranchKpi } from "./api";
import type { PanelKind } from "./metrics";

/** Число в реченні — кнопка, що відкриває розбивку цього показника по філіях. */
function Num({ kind, onOpen, children }: { kind: PanelKind; onOpen: (kind: PanelKind) => void; children: ReactNode }) {
  return (
    <button type="button" className="nd-lead-num" onClick={() => onOpen(kind)}>{children}</button>
  );
}

/** Лід брифу: два речення з головними числами. Усі числа клікабельні.
    «У базі мережі 674 дитини (+19 нових за 1–20 жовтня). За період проведено 79 занять з 88 запланованих,
    відвідуваність 77,3 %, нараховано 25 020 ₴ зарплат.»
    Перше речення — поточна база (знімок на кінець періоду), друге — показники за період:
    бриф §4–5 просить не змішувати базу дітей із періодом. */
export function Lead({ kpi, period, subject, onOpen }: {
  kpi: MainBranchKpi | undefined;
  /** «за 1–20 жовтня» або «сьогодні» — стоїть у дужках після нових */
  period: string;
  /** Родовий відмінок: «мережі», «філії «Львів»», «2 філій» */
  subject: string;
  onOpen: (kind: PanelKind) => void;
}) {
  if (!kpi) {
    return (
      <p className="nd-lead nd-lead-skel" aria-busy="true" aria-label="Завантажуємо показники">
        <span className="nd-skel" style={{ width: "92%", height: 26 }} />
        <span className="nd-skel" style={{ width: "58%", height: 26 }} />
      </p>
    );
  }
  const kids = kpi.students_total;
  const fresh = kpi.students_new;
  const done = kpi.lessons_completed;
  const planned = kpi.lessons_scheduled;
  const today = period === "сьогодні";

  // Друге речення — безособове («проведено», «нараховано»): узгоджувати з підметом нічого не треба.
  return (
    <p className="nd-lead">
      У базі {subject}{" "}
      <Num kind="students" onOpen={onOpen}>{formatNumber(kids)} {pluralUk(kids, "дитина", "дитини", "дітей")}</Num>
      {" "}<span className="nd-lead-paren">(<Num kind="new" onOpen={onOpen}>{fresh > 0 ? `+${formatNumber(fresh)} ${pluralUk(fresh, "нова", "нові", "нових")} ${period}` : `нових ${period} немає`}</Num>).</span>{" "}
      {today ? "Сьогодні" : "За період"}{" "}
      {planned === 0 ? (
        <>занять не було, </>
      ) : (
        <>
          проведено{" "}
          <Num kind="lessons" onOpen={onOpen}>{formatNumber(done)} {pluralUk(done, "заняття", "заняття", "занять")}</Num>
          {" "}<span className="nd-nowrap">з {formatNumber(planned)} {planned === 1 ? "запланованого" : "запланованих"}</span>,{" "}
          {kpi.attendance_has_data
            ? <>відвідуваність <Num kind="attendance" onOpen={onOpen}>{formatPercent(kpi.attendance_rate_pct)}</Num>, </>
            : <>відвідуваність поки без даних, </>}
        </>
      )}
      нараховано <Num kind="payroll" onOpen={onOpen}>{formatCurrency(kpi.payroll_total_uah)} ₴</Num> зарплат.
    </p>
  );
}
