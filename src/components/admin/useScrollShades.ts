import { useEffect, useRef } from "react";

/** Вішає на скрол-контейнер класи shade-l / shade-r, коли частина контенту
    схована за лівим/правим краєм — липкі колонки показують тінь-підказку. */
export function useScrollShades<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      el.classList.toggle("shade-l", el.scrollLeft > 2);
      el.classList.toggle("shade-r", el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  return ref;
}
