import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clubsQueries } from "../../features/clubs/api";
import { studentsQueries } from "../../features/students/api";
import { slotTime } from "../../features/students/types";
import { teachersQueries } from "../../features/teachers/api";
import { IconClubs, IconSearch, IconStudents, IconTeacher } from "../../lib/icons";
import { buildNavGroups, toneToStyle, type NavLeaf } from "./navConfig";

interface Props {
  open: boolean;
  isOwner: boolean;
  hasNetworkAccess: boolean;
  role?: "owner" | "admin" | "teacher" | undefined;
  onClose: () => void;
}

interface Item {
  key: string;
  group: string;
  title: string;
  sub?: string;
  icon: React.ReactNode;
  tone: NavLeaf["tone"];
  /** Куди веде вибір (SPA-маршрут, можливо з ?q=). */
  to: string;
}

const LIMIT_PER_GROUP = 5;

export function SearchPalette({ open, isOwner, hasNetworkAccess, role, onClose }: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const canManage = role !== "teacher";

  // Дані підвантажуються лише коли палітра відкрита; ключі кешу спільні зі сторінками
  const students = useQuery({ ...studentsQueries.list(), enabled: open, staleTime: 60_000 });
  const teachers = useQuery({ ...teachersQueries.list(), enabled: open && canManage, staleTime: 60_000 });
  const clubs = useQuery({ ...clubsQueries.list(), enabled: open, staleTime: 60_000 });

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      // Фокус після монтування overlay
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const query = q.trim().toLowerCase();
    const out: Item[] = [];

    // Сторінки (навігація) — доступні одразу, ще до вводу
    const pages: Item[] = [
      {
        key: "page-home", group: "Сторінки", title: "Головна", sub: "Панель адміністратора",
        icon: <IconSearch />, tone: "terra", to: "/",
      },
      ...buildNavGroups({}, isOwner, hasNetworkAccess, role).flatMap((g) =>
        g.items
          .filter((leaf) => !leaf.href.startsWith("/admin"))
          .map((leaf) => ({
            key: `page-${leaf.href}`, group: "Сторінки", title: leaf.title,
            sub: g.label, icon: leaf.icon, tone: leaf.tone, to: leaf.href,
          })),
      ),
    ];

    if (!query) return pages.slice(0, 8);

    out.push(...pages.filter((p) => p.title.toLowerCase().includes(query)).slice(0, 4));

    const matchedStudents = (students.data ?? [])
      .filter((s) =>
        [`${s.last_name} ${s.first_name}`, s.first_name, s.last_name, s.middle_name, s.phone_child]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(query)),
      )
      .slice(0, LIMIT_PER_GROUP);
    out.push(
      ...matchedStudents.map((s) => ({
        key: `student-${s.id}`, group: "Учні",
        title: `${s.last_name} ${s.first_name}${s.middle_name ? ` ${s.middle_name}` : ""}`,
        sub: [
          s.grade ? `${s.grade} клас` : "Учень",
          ...(s.schedule ?? []).map((l) => `${slotTime(l, false)} ${l.club_name ?? "Заняття"}`),
        ].join(" · "),
        icon: <IconStudents />, tone: "terra" as const,
        to: `/students?q=${encodeURIComponent(`${s.last_name} ${s.first_name}`)}`,
      })),
    );

    const matchedTeachers = (teachers.data ?? [])
      .filter((t) => t.full_name.toLowerCase().includes(query))
      .slice(0, LIMIT_PER_GROUP);
    out.push(
      ...matchedTeachers.map((t) => ({
        key: `teacher-${t.id}`, group: "Вчителі", title: t.full_name, sub: "Вчитель",
        icon: <IconTeacher />, tone: "olive" as const,
        to: `/teachers?q=${encodeURIComponent(t.full_name)}`,
      })),
    );

    const matchedClubs = (clubs.data ?? [])
      .filter((c) => c.name.toLowerCase().includes(query) || c.location.toLowerCase().includes(query))
      .slice(0, LIMIT_PER_GROUP);
    out.push(
      ...matchedClubs.map((c) => ({
        key: `club-${c.id}`, group: "Гуртки", title: c.name, sub: c.location || "Гурток",
        icon: <IconClubs />, tone: "gold" as const,
        to: `/clubs?q=${encodeURIComponent(c.name)}`,
      })),
    );

    return out;
  }, [q, isOwner, hasNetworkAccess, students.data, teachers.data, clubs.data]);

  // Тримаємо виділення в межах списку при зміні результатів
  useEffect(() => {
    setSel((cur) => Math.min(cur, Math.max(0, items.length - 1)));
  }, [items.length]);

  if (!open) return null;

  function go(item: Item) {
    onClose();
    navigate(item.to);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((cur) => Math.min(cur + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((cur) => Math.max(cur - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[sel]) go(items[sel]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  const loading = q.trim() !== "" && (students.isLoading || teachers.isLoading || clubs.isLoading);
  let lastGroup = "";

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Глобальний пошук">
        <div className="cmdk-head">
          <IconSearch />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={onKeyDown}
            placeholder="Учень, вчитель, гурток або сторінка…"
            aria-label="Пошук"
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {loading && <div className="cmdk-empty">Завантаження…</div>}
          {!loading && items.length === 0 && (
            <div className="cmdk-empty">Нічого не знайдено за «{q.trim()}»</div>
          )}
          {items.map((item, i) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {showGroup && <div className="cmdk-group">{item.group}</div>}
                <button
                  className={`cmdk-item${i === sel ? " sel" : ""}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(item)}
                >
                  <span className="dd-ic" style={toneToStyle(item.tone)}>{item.icon}</span>
                  <span className="cmdk-txt">
                    <span className="dd-t">{item.title}</span>
                    {item.sub && <span className="dd-s">{item.sub}</span>}
                  </span>
                  <span className="cmdk-enter">↵</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
