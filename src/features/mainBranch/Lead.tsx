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

/** Лід брифу: одне речення з головними числами періоду. Усі числа клікабельні.
    «За 1–20 жовтня мережа охоплює 674 дитини (+19 нових), провела 79 занять з 88 запланованих
    з відвідуваністю 77,3 % і нарахувала 25 020 ₴ зарплат.» */
export function Lead({ kpi, when, subject, plural, onOpen }: {
  kpi: MainBranchKpi | undefined;
  /** «За 1–20 жовтня» або «Сьогодні» */
  when: string;
  /** «мережа», «філія «Львів»», «2 філії» */
  subject: string;
  /** Підмет у множині — дієслова теж («охоплюють», «провели») */
  plural: boolean;
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

  // Друге речення — безособове («проведено», «нараховано»): узгоджувати з підметом треба лише перше.
  return (
    <p className="nd-lead">
      {when} {subject} {plural ? "охоплюють" : "охоплює"}{" "}
      <Num kind="students" onOpen={onOpen}>{formatNumber(kids)} {pluralUk(kids, "дитину", "дитини", "дітей")}</Num>
      {" "}(<Num kind="new" onOpen={onOpen}>{fresh > 0 ? `+${formatNumber(fresh)} ${pluralUk(fresh, "нова", "нові", "нових")}` : "нових немає"}</Num>).{" "}
      {planned === 0 ? (
        <>Занять за період не було, </>
      ) : (
        <>
          Проведено{" "}
          <Num kind="lessons" onOpen={onOpen}>{formatNumber(done)} {pluralUk(done, "заняття", "заняття", "занять")}</Num>
          {" "}з {formatNumber(planned)} {planned === 1 ? "запланованого" : "запланованих"},{" "}
          {kpi.attendance_has_data
            ? <>відвідуваність <Num kind="attendance" onOpen={onOpen}>{formatPercent(kpi.attendance_rate_pct)}</Num>, </>
            : <>відвідуваність поки без даних, </>}
        </>
      )}
      нараховано <Num kind="payroll" onOpen={onOpen}>{formatCurrency(kpi.payroll_total_uah)} ₴</Num> зарплат.
    </p>
  );
}
