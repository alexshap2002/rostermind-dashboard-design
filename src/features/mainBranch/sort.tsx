import { useMemo, useState, type ReactNode } from "react";

export type SortDir = "asc" | "desc";

/** Сортування рядків таблиці кліком по заголовку. null / undefined — завжди внизу. */
export function useSort<T>(rows: T[], initialKey: keyof T & string, initialDir: SortDir = "asc") {
  const [key, setKey] = useState<keyof T & string>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[key] as unknown;
      const bv = b[key] as unknown;
      if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv, "uk") : Number(av) - Number(bv);
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, key, dir]);
  const toggle = (next: keyof T & string, defaultDir: SortDir = "desc") => {
    if (next === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setKey(next);
      setDir(defaultDir);
    }
  };
  return { sorted, key, dir, toggle };
}

export function SortTh<T>({
  sort,
  field,
  children,
  className,
  defaultDir = "desc",
}: {
  sort: { key: string; dir: SortDir; toggle: (k: keyof T & string, d?: SortDir) => void };
  field: keyof T & string;
  children: ReactNode;
  className?: string;
  defaultDir?: SortDir;
}) {
  const active = sort.key === field;
  return (
    <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={`th-sort${active ? " on" : ""}`} onClick={() => sort.toggle(field, defaultDir)}>
        {children}
        <span className="th-arrow" aria-hidden="true">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}
