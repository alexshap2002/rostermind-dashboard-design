/* Демо для показу дизайну (VITE_DEMO=1): підміняє fetch вигаданими даними мережі з трьох філій.
   Усі числа рахуються з одних і тих самих «уроків», тож KPI, таблиця, графік і бічна панель узгоджені.
   Реальних даних тут немає: імена, гуртки й суми — вигадані. */

type Status = "COMPLETED" | "CANCELLED" | "SKIPPED" | "UNMARKED" | "UPCOMING";

interface Club { id: number; name: string; teacher: string; teacherId: number; rate: number; size: number; slots: [number, string][] }
interface Branch { id: number; name: string; base: number; rate: number; newPerWeek: number; clubs: Club[] }
interface Lesson {
  id: number; tenant: Branch; club: Club; date: string; time: string; status: Status;
  present: number; total: number; pay: number;
}

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00Z`);

function kyivNow(): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let teacherSeq = 100;
let clubSeq = 300;
const club = (name: string, teacher: string, rate: number, size: number, slots: [number, string][]): Club =>
  ({ id: clubSeq++, name, teacher, teacherId: teacherSeq++, rate, size, slots });

const BRANCHES: Branch[] = [
  {
    id: 7, name: "Львів", base: 236, rate: 0.79, newPerWeek: 3.2,
    clubs: [
      club("Англійська 1", "Мельник Оксана", 220, 10, [[1, "16:05"], [3, "16:05"], [4, "17:05"]]),
      club("Англійська 2", "Гнатюк Тарас", 220, 9, [[1, "17:05"], [3, "17:05"], [4, "18:05"]]),
      club("Ерудит", "Савчук Галина", 220, 11, [[2, "16:05"], [4, "16:05"]]),
      club("Кулінарія", "Бойко Ірина", 240, 8, [[2, "17:05"], [5, "16:05"]]),
      club("Робототехніка", "Кравець Андрій", 300, 8, [[2, "18:05"], [4, "19:05"]]),
      club("Рукоділля", "Ткачук Марія", 220, 9, [[1, "18:05"], [3, "18:05"]]),
      club("Фото, відео", "Яковенко Дарина", 220, 0, [[4, "16:00"], [4, "17:00"]]),
      club("Чергування адміністратора", "Сидоренко Олена", 1600, 0, [[4, "16:05"]]),
    ],
  },
  {
    id: 5, name: "Брусилів", base: 158, rate: 0.73, newPerWeek: 1.8,
    clubs: [
      club("Англійська", "Коваленко Наталія", 200, 9, [[1, "15:00"], [3, "15:00"]]),
      club("Шахи", "Петренко Олег", 200, 8, [[2, "15:30"], [4, "15:30"]]),
      club("Малювання", "Лисенко Ольга", 200, 10, [[1, "16:30"], [5, "15:00"]]),
      club("Хор", "Дмитренко Людмила", 220, 12, [[3, "16:30"]]),
      club("Підготовка до школи", "Шевчук Анна", 220, 7, [[2, "10:00"], [4, "10:00"]]),
    ],
  },
  {
    id: 9, name: "Ірпінь", base: 104, rate: 0.84, newPerWeek: 2.4,
    clubs: [
      club("Робототехніка", "Ковальчук Дмитро", 280, 8, [[2, "16:00"], [4, "16:00"]]),
      club("Англійська", "Олійник Софія", 220, 9, [[1, "16:00"], [3, "16:00"]]),
      club("Театр", "Захарченко Вікторія", 220, 11, [[5, "16:30"], [6, "11:00"]]),
    ],
  },
];


// ── Генерація ──
const NOW = kyivNow();
const TODAY = NOW.date;
const START = iso(new Date(parse(TODAY).getTime() - 140 * DAY));
const END = iso(new Date(parse(TODAY).getTime() + 21 * DAY));

const LESSONS: Lesson[] = [];
const NEW_STUDENTS: { tenant: number; date: string }[] = [];
const BONUSES: { tenant: number; teacherId: number; teacher: string; date: string; amount: number }[] = [];

(() => {
  let id = 9000;
  const unmarkedPlan = new Map<string, number>([
    // філія → скільки уроків за останні два тижні лишаться невідміченими
    ["7", 3], ["5", 1], ["9", 0],
  ]);
  for (let t = parse(START).getTime(); t <= parse(END).getTime(); t += DAY) {
    const d = new Date(t);
    const date = iso(d);
    const weekday = ((d.getUTCDay() + 6) % 7) + 1;
    const daysAgo = Math.round((parse(TODAY).getTime() - t) / DAY);
    for (const b of BRANCHES) {
      const r = rng(b.id * 100_000 + Math.floor(t / DAY));
      // нові діти: в середньому newPerWeek на тиждень, у вересні — більше
      const boost = d.getUTCMonth() === 8 ? 2.2 : 1;
      if (date <= TODAY) {
        let lambda = (b.newPerWeek / 7) * boost;
        while (lambda > 0) { if (r() < Math.min(1, lambda)) NEW_STUDENTS.push({ tenant: b.id, date }); lambda -= 1; }
      }
      for (const c of b.clubs) {
        for (const [wd, time] of c.slots) {
          if (wd !== weekday) continue;
          const roll = r();
          let status: Status;
          if (date > TODAY || (date === TODAY && Number(time.slice(0, 2)) >= NOW.hour)) status = "UPCOMING";
          else if (roll < 0.025) status = "CANCELLED";
          else if (roll < 0.035) status = "SKIPPED";
          else status = "COMPLETED";
          // Ірпінь: за останні 10 днів відвідуваність помітно падає — сигнал «впала»
          const dip = b.id === 9 && daysAgo >= 0 && daysAgo < 10 ? 0.14 : 0;
          const septemberLift = d.getUTCMonth() === 8 ? 0.03 : 0;
          const rate = Math.max(0.3, Math.min(0.98, b.rate + septemberLift - dip + (r() - 0.5) * 0.18));
          const total = c.size ? c.size + Math.round((r() - 0.5) * 3) : 0;
          const present = status === "COMPLETED" ? Math.round(total * rate) : 0;
          LESSONS.push({
            id: id++, tenant: b, club: c, date, time, status, present, total,
            pay: status === "COMPLETED" && (present > 0 || c.size === 0) ? c.rate : 0,
          });
        }
      }
    }
  }
  // Невідмічені: кілька минулих уроків за останні 2 тижні
  for (const b of BRANCHES) {
    let left = unmarkedPlan.get(String(b.id)) ?? 0;
    const recent = LESSONS.filter((l) => l.tenant.id === b.id && l.status === "COMPLETED" && l.date < TODAY
      && (parse(TODAY).getTime() - parse(l.date).getTime()) / DAY <= 12 && l.club.size > 0).reverse();
    for (const l of recent) {
      if (left <= 0) break;
      if (l.id % 3 !== 0) continue;
      l.status = "UNMARKED"; l.present = 0; l.pay = 0; left -= 1;
    }
  }
  // Премії — раз на місяць кільком вчителям
  for (const b of BRANCHES) {
    for (const c of b.clubs.slice(0, 2)) {
      for (let m = 0; m < 5; m++) {
        const d = new Date(Date.UTC(parse(TODAY).getUTCFullYear(), parse(TODAY).getUTCMonth() - m, 5, 12));
        if (iso(d) <= TODAY) BONUSES.push({ tenant: b.id, teacherId: c.teacherId, teacher: c.teacher, date: iso(d), amount: 500 });
      }
    }
  }
})();

// ── Запити ──
interface Range { from: string; to: string; ids: number[] }

function rangeOf(url: URL): Range {
  const ids = url.searchParams.getAll("branch_ids").map(Number).filter(Boolean);
  return { from: url.searchParams.get("date_from") ?? TODAY, to: url.searchParams.get("date_to") ?? TODAY, ids };
}
const inBranches = (r: Range) => (b: Branch) => !r.ids.length || r.ids.includes(b.id);
const lessonsIn = (r: Range, b?: Branch) =>
  LESSONS.filter((l) => l.date >= r.from && l.date <= r.to && (b ? l.tenant.id === b.id : inBranches(r)(l.tenant)));

function stats(list: Lesson[]) {
  const withKids = list.filter((l) => l.status === "COMPLETED" && l.club.size > 0);
  const present = withKids.reduce((s, l) => s + l.present, 0);
  const total = withKids.reduce((s, l) => s + l.total, 0);
  return {
    scheduled: list.filter((l) => l.status !== "CANCELLED").length,
    completed: list.filter((l) => l.status === "COMPLETED").length,
    skipped: list.filter((l) => l.status === "SKIPPED").length,
    cancelled: list.filter((l) => l.status === "CANCELLED").length,
    unmarked: list.filter((l) => l.status === "UNMARKED").length,
    upcoming: list.filter((l) => l.status === "UPCOMING").length,
    present, total, rate: total ? Math.round((present / total) * 1000) / 10 : null,
    pay: list.reduce((s, l) => s + l.pay, 0),
  };
}
const bonusIn = (r: Range, tenant?: number) =>
  BONUSES.filter((x) => x.date >= r.from && x.date <= r.to && (tenant ? x.tenant === tenant : !r.ids.length || r.ids.includes(x.tenant)));
const studentsAt = (b: Branch, date: string) => b.base + NEW_STUDENTS.filter((s) => s.tenant === b.id && s.date <= date).length;
const newIn = (b: Branch, r: Range) => NEW_STUDENTS.filter((s) => s.tenant === b.id && s.date >= r.from && s.date <= r.to).length;
const teachersOf = (b: Branch) => new Set(b.clubs.map((c) => c.teacherId)).size;

function isFullMonth(from: string, to: string) {
  const f = parse(from); const t = parse(to);
  return f.getUTCDate() === 1 && f.getUTCMonth() === t.getUTCMonth() && new Date(t.getTime() + DAY).getUTCDate() === 1;
}

/** Як у бекенді: порівнюємо без сьогодні (день ще триває); короткий період — ті самі дні тижня тижнем раніше. */
function comparison(r: Range): { cur: Range; prev: Range } | null {
  let to = r.to;
  if (to >= TODAY) to = iso(new Date(parse(TODAY).getTime() - DAY));
  if (to < r.from) return null;
  const cur = { ...r, to };
  if (isFullMonth(r.from, r.to)) {
    const f = parse(r.from);
    const pf = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() - 1, 1, 12));
    const pt = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 0, 12));
    return { cur, prev: { ...r, from: iso(pf), to: iso(pt) } };
  }
  const span = Math.round((parse(to).getTime() - parse(r.from).getTime()) / DAY) + 1;
  const shift = (span < 28 ? Math.ceil(span / 7) * 7 : span) * DAY;
  return { cur, prev: { ...r, from: iso(new Date(parse(r.from).getTime() - shift)), to: iso(new Date(parse(to).getTime() - shift)) } };
}

const pct = (cur: number | null, prev: number | null) =>
  cur === null || prev === null || prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10;

function kpi(r: Range) {
  const branches = BRANCHES.filter(inBranches(r));
  const cmp = comparison(r);
  const rows = branches.map((b) => {
    const s = stats(lessonsIn(r, b));
    const p = cmp ? stats(lessonsIn(cmp.prev, b)) : null;
    const c = cmp ? stats(lessonsIn(cmp.cur, b)) : null;
    return {
      tenant_id: b.id, tenant_name: b.name,
      students_total: studentsAt(b, r.to > TODAY ? TODAY : r.to), students_new: newIn(b, r), teachers_total: teachersOf(b),
      lessons_scheduled: s.scheduled, lessons_completed: s.completed, lessons_skipped: s.skipped, lessons_cancelled: s.cancelled,
      lessons_unmarked_overdue: s.unmarked, lessons_upcoming: s.upcoming,
      present_students: s.present, total_students: s.total, attendance_rate_pct: s.rate,
      previous_attendance_rate_pct: p?.rate ?? null,
      attendance_change_pp: c?.rate != null && p?.rate != null ? Math.round((c.rate - p.rate) * 10) / 10 : null,
      payroll_uah: s.pay + bonusIn(r, b.id).reduce((x, y) => x + y.amount, 0),
    };
  });
  const all = stats(lessonsIn(r));
  const pay = all.pay + bonusIn(r).reduce((x, y) => x + y.amount, 0);
  const curS = cmp ? stats(lessonsIn(cmp.cur)) : null;
  const prevS = cmp ? stats(lessonsIn(cmp.prev)) : null;
  const curPay = cmp ? curS!.pay + bonusIn(cmp.cur).reduce((x, y) => x + y.amount, 0) : null;
  const prevPay = cmp ? prevS!.pay + bonusIn(cmp.prev).reduce((x, y) => x + y.amount, 0) : null;
  return {
    branches_total: branches.length, branches_total_all: BRANCHES.length, branches_pending_or_inactive: 0,
    students_total: rows.reduce((s, x) => s + x.students_total, 0),
    students_new: rows.reduce((s, x) => s + x.students_new, 0),
    teachers_total: rows.reduce((s, x) => s + x.teachers_total, 0),
    lessons_total: all.scheduled + all.cancelled, lessons_scheduled: all.scheduled, lessons_completed: all.completed,
    lessons_skipped: all.skipped, lessons_cancelled: all.cancelled, lessons_unmarked_overdue: all.unmarked, lessons_upcoming: all.upcoming,
    attendance_rate_pct: all.rate ?? 0, attendance_has_data: all.rate !== null,
    payroll_total_uah: pay, branch_rows: rows, generated_at: new Date().toISOString(),
    comparison: cmp
      ? {
          current_period: { date_from: cmp.cur.from, date_to: cmp.cur.to },
          previous_period: { date_from: cmp.prev.from, date_to: cmp.prev.to },
          lessons_completed: { current: curS!.completed, previous: prevS!.completed, delta_percent: pct(curS!.completed, prevS!.completed) },
          attendance_rate_pct: {
            current: curS!.rate, previous: prevS!.rate, delta_percent: null,
            delta_percentage_points: curS!.rate != null && prevS!.rate != null ? Math.round((curS!.rate - prevS!.rate) * 10) / 10 : null,
          },
          payroll_total_uah: { current: curPay, previous: prevPay, delta_percent: pct(curPay, prevPay) },
        }
      : {},
  };
}

const lessonIsoUtc = (l: Lesson) => {
  // Київ — UTC+3 восени
  const [h, m] = l.time.split(":").map(Number);
  return `${l.date}T${pad(h - 3)}:${pad(m)}:00+00:00`;
};

function unmarkedRows(r: Range) {
  return lessonsIn(r).filter((l) => l.status === "UNMARKED").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map((l) => ({
    tenant_id: l.tenant.id, tenant_name: l.tenant.name, lesson_id: l.id, lesson_date: lessonIsoUtc(l), club_name: l.club.name,
    anomaly_type: "UNMARKED_LESSON", severity: "warning", summary_text: `Урок «${l.club.name}» не відмічено`,
    action_label: "Відмітити", action_url: `/admin/conducted_lessons?lesson_id=${l.id}`,
    details_json: {
      teacher_name: l.club.teacher, lesson_day: l.date,
      days_late: Math.round((parse(TODAY).getTime() - parse(l.date).getTime()) / DAY),
    },
  }));
}

function dropRows(r: Range) {
  // Порівнюємо останні 7 днів з попередніми 7 — так само для всіх філій
  return BRANCHES.filter(inBranches(r)).flatMap((b) => {
    const to = iso(new Date(parse(TODAY).getTime() - DAY));
    const last = stats(lessonsIn({ from: iso(new Date(parse(to).getTime() - 6 * DAY)), to, ids: [] }, b)).rate;
    const before = stats(lessonsIn({ from: iso(new Date(parse(to).getTime() - 13 * DAY)), to: iso(new Date(parse(to).getTime() - 7 * DAY)), ids: [] }, b)).rate;
    if (last === null || before === null || before - last < 6) return [];
    const drop = Math.round((before - last) * 10) / 10;
    return [{
      tenant_id: b.id, tenant_name: b.name, lesson_id: null, lesson_date: null, club_name: null,
      anomaly_type: "ATTENDANCE_DROP", severity: "high",
      summary_text: `Відвідуваність за тиждень впала на ${String(drop).replace(".", ",")} в.п. (${String(before).replace(".", ",")}% → ${String(last).replace(".", ",")}%)`,
      action_label: "Переглянути", action_url: null, details_json: {},
    }];
  });
}

function anomalies(url: URL) {
  const r = rangeOf(url);
  const type = url.searchParams.get("anomaly_type");
  let rows = [...unmarkedRows(r), ...dropRows(r)];
  if (type) rows = rows.filter((x) => x.anomaly_type === type);
  const severity = url.searchParams.get("severity");
  if (severity) rows = rows.filter((x) => x.severity === severity);
  const cursor = Number(url.searchParams.get("cursor") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const page = rows.slice(cursor, cursor + limit);
  return {
    rows: page,
    totals: { total: rows.length, by_type: countBy(rows, "anomaly_type"), by_severity: countBy(rows, "severity") },
    page: { limit, cursor, next_cursor: cursor + limit < rows.length ? cursor + limit : null, returned: page.length, total: rows.length },
  };
}
function countBy<T>(rows: T[], key: keyof T) {
  const out: Record<string, number> = {};
  for (const row of rows) out[String(row[key])] = (out[String(row[key])] ?? 0) + 1;
  return out;
}

function attention(url: URL) {
  const r = rangeOf(url);
  const rows = [...dropRows(r), ...unmarkedRows(r)];
  const items = rows.map((x) => ({
    tenant_id: x.tenant_id, tenant_name: x.tenant_name, anomaly_type: x.anomaly_type, severity: x.severity, summary: x.summary_text,
    action_label: x.action_label, action_url: x.action_url, lesson_date: x.lesson_date, club_name: x.club_name,
  }));
  return {
    totals: {
      critical: 0, high: rows.filter((x) => x.severity === "high").length, warning: rows.filter((x) => x.severity === "warning").length,
      total: rows.length, by_tenant: countBy(rows, "tenant_id"),
    },
    items, generated_at: new Date().toISOString(),
  };
}

function trends(url: URL) {
  const r = rangeOf(url);
  const days: string[] = [];
  for (let t = parse(r.from).getTime(); t <= parse(r.to).getTime(); t += DAY) days.push(iso(new Date(t)));
  const day = (d: string, b?: Branch) => {
    const s = stats(lessonsIn({ ...r, from: d, to: d }, b));
    return { lessons: s.completed, present: s.present, total: s.total, rate: s.rate, pay: s.pay };
  };
  const weeks = new Map<string, string[]>();
  for (const d of days) {
    const w = parse(d); const monday = iso(new Date(w.getTime() - ((w.getUTCDay() + 6) % 7) * DAY));
    weeks.set(monday, [...(weeks.get(monday) ?? []), d]);
  }
  const week = (ds: string[], b?: Branch) => {
    const s = stats(lessonsIn({ ...r, from: ds[0], to: ds[ds.length - 1] }, b));
    return { lessons: s.completed, present: s.present, total: s.total, rate: s.rate, pay: s.pay };
  };
  return {
    series: {
      daily: days.map((d) => { const x = day(d); return { date: d, lessons: x.lessons, present_students: x.present, total_students: x.total, attendance_rate_pct: x.rate, has_data: x.rate !== null, payroll_uah: x.pay }; }),
      weekly: [...weeks].map(([monday, ds]) => { const x = week(ds); return { week: monday, week_start: monday, date_from: ds[0], date_to: ds[ds.length - 1], lessons: x.lessons, present_students: x.present, total_students: x.total, attendance_rate_pct: x.rate, has_data: x.rate !== null, payroll_uah: x.pay }; }),
      by_branch: BRANCHES.filter(inBranches(r)).map((b) => ({
        tenant_id: b.id, tenant_name: b.name,
        daily: days.map((d) => ({ date: d, attendance_rate_pct: day(d, b).rate })),
        weekly: [...weeks].map(([monday, ds]) => ({ week_start: monday, attendance_rate_pct: week(ds, b).rate })),
      })),
    },
    generated_at: new Date().toISOString(),
  };
}

function lessonsReport(url: URL) {
  const r = rangeOf(url);
  const branches = BRANCHES.filter(inBranches(r));
  const rows = branches.map((b) => {
    const s = stats(lessonsIn(r, b));
    return {
      tenant_id: b.id, tenant_name: b.name, lessons_total: s.scheduled + s.cancelled, completed: s.completed, skipped: s.skipped,
      cancelled: s.cancelled, unmarked_overdue: s.unmarked, upcoming: s.upcoming, students_total: s.total,
      students_present_total: s.present, attendance_rate_pct: s.rate,
    };
  });
  const all = stats(lessonsIn(r));
  const cmp = comparison(r);
  return {
    rows,
    totals: {
      lessons_total: all.scheduled + all.cancelled, completed: all.completed, skipped: all.skipped, cancelled: all.cancelled,
      unmarked_overdue: all.unmarked, upcoming: all.upcoming, students_total: all.total, students_present_total: all.present,
      attendance_rate_pct: all.rate,
    },
    club_rows: branches.flatMap((b) => b.clubs.map((c) => {
      const list = lessonsIn(r, b).filter((l) => l.club.id === c.id);
      const s = stats(list);
      const p = cmp ? stats(lessonsIn(cmp.prev, b).filter((l) => l.club.id === c.id)).rate : null;
      return {
        tenant_id: b.id, tenant_name: b.name, club_id: c.id, club_name: c.name, teacher_names: c.teacher,
        lessons_scheduled: s.scheduled, lessons_completed: s.completed, lessons_unmarked_overdue: s.unmarked,
        present_students: s.present, total_students: s.total, attendance_rate_pct: c.size ? s.rate : null,
        previous_attendance_rate_pct: c.size ? p : null,
        attendance_change_pp: c.size && s.rate !== null && p !== null ? Math.round((s.rate - p) * 10) / 10 : null,
      };
    })),
  };
}

function attendanceReport(url: URL) {
  const r = rangeOf(url);
  const branches = BRANCHES.filter(inBranches(r));
  const chronic = branches.flatMap((b, bi) => Array.from({ length: [4, 2, 3][bi] ?? 2 }, (_, i) => {
    const lessons = 8 + ((i * 3 + bi) % 6);
    const absences = Math.round(lessons * (0.5 + ((i + bi) % 3) * 0.1));
    return {
      tenant_id: b.id, tenant_name: b.name, student_id: b.id * 1000 + i,
      // Явно вигадані імена: щоб випадково не збігтися з дитиною з реальної бази.
      student_name: `Демо-учень ${b.name} ${i + 1}`,
      lessons, absences, absence_pct: Math.round((absences / lessons) * 1000) / 10,
    };
  }));
  const rows = branches.map((b) => {
    const s = stats(lessonsIn(r, b));
    return {
      tenant_id: b.id, tenant_name: b.name, expected_students: s.total, present_students: s.present,
      absent_students: s.total - s.present, attendance_rate_pct: s.rate,
      chronic_absence_students_count: chronic.filter((c) => c.tenant_id === b.id).length,
    };
  });
  const all = stats(lessonsIn(r));
  return {
    rows,
    totals: { expected_students: all.total, present_students: all.present, absent_students: all.total - all.present, attendance_rate_pct: all.rate },
    chronic_rows: chronic,
  };
}

function teachersReport(url: URL) {
  const r = rangeOf(url);
  const payroll_rows = BRANCHES.filter(inBranches(r)).flatMap((b) => b.clubs.map((c) => {
    const list = lessonsIn(r, b).filter((l) => l.club.id === c.id && l.pay > 0);
    const lessonsAmount = list.reduce((s, l) => s + l.pay, 0);
    const bonus = BONUSES.filter((x) => x.teacherId === c.teacherId && x.date >= r.from && x.date <= r.to).reduce((s, x) => s + x.amount, 0);
    return {
      tenant_id: b.id, tenant_name: b.name, teacher_id: c.teacherId, teacher_name: c.teacher, lessons_paid: list.length,
      lessons_amount_uah: lessonsAmount, bonus_amount_uah: bonus, total_uah: lessonsAmount + bonus,
    };
  })).filter((x) => x.total_uah > 0);
  const sum = (k: "lessons_amount_uah" | "bonus_amount_uah" | "total_uah") => payroll_rows.reduce((s, x) => s + x[k], 0);
  return { rows: [], payroll_rows, payroll_totals: { lessons_amount_uah: sum("lessons_amount_uah"), bonus_amount_uah: sum("bonus_amount_uah"), total_uah: sum("total_uah") } };
}

const lviv = BRANCHES[0];
const CONTEXT = {
  owner_account_id: 1, network_role: "network_owner", primary_tenant_id: lviv.id,
  capabilities: {
    datasets: ["kpi", "trends", "attention", "lessons", "attendance", "teachers", "anomalies"],
    export_datasets: ["full"], can_manage_members: true, can_manage_branches: true, can_manage_billing: true,
    can_switch_branch: true, can_export_full_report: true,
  },
  branches: BRANCHES.map((b) => ({
    tenant_id: b.id, tenant_name: b.name, lifecycle_status: "active", lifecycle_reason: null,
    is_primary: b.id === lviv.id, is_current: b.id === lviv.id,
  })),
};

function summary() {
  return {
    user: { full_name: "Власник мережі (демо)", role: "owner", initials: "ВМ" },
    tenant: { name: lviv.name, slug: "demo-lviv" },
    stats: {
      students: studentsAt(lviv, TODAY), students_delta_month: 6, teachers: teachersOf(lviv), clubs: lviv.clubs.length,
      active_schedules: lviv.clubs.reduce((s, c) => s + c.slots.length, 0), lessons_this_week: 21,
    },
    payroll_by_month: [], generated_at: new Date().toISOString(),
  };
}

function route(url: URL): unknown | undefined {
  const p = url.pathname;
  if (p === "/api/dashboard/summary") return summary();
  if (p === "/api/network/context") return CONTEXT;
  if (p === "/auth/me") return { role: "owner", tenant_id: lviv.id, full_name: "Власник мережі (демо)" };
  if (p === "/api/owner/main-branch/kpi") return kpi(rangeOf(url));
  if (p === "/api/owner/main-branch/attention") return attention(url);
  if (p === "/api/owner/main-branch/anomalies") return anomalies(url);
  if (p === "/api/owner/main-branch/trends") return trends(url);
  if (p === "/api/owner/main-branch/lessons") return lessonsReport(url);
  if (p === "/api/owner/main-branch/attendance") return attendanceReport(url);
  if (p === "/api/owner/main-branch/teachers") return teachersReport(url);
  return undefined;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function installDemoApi() {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return real(input, init);
    await new Promise((resolve) => setTimeout(resolve, 120)); // як справжня мережа — видно стани завантаження
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") return json(403, { detail: "У демо-версії зміни вимкнено" });
    const body = route(url);
    return body === undefined ? json(404, { detail: "У демо-версії ці дані недоступні" }) : json(200, body);
  };
}

export const DEMO = import.meta.env.VITE_DEMO === "1";
