import { Link } from "react-router-dom";
import { PageShell, EmptyState } from "../../components/admin/primitives";

export function NotFoundPage() {
  return (
    <PageShell title="Сторінку не знайдено" subtitle="Такої адреси немає в системі">
      <EmptyState title="404 — сторінку не знайдено">
        Схоже, ви перейшли за неіснуючим посиланням.{" "}
        <Link className="link" to="/">Повернутися на головну</Link>
      </EmptyState>
    </PageShell>
  );
}
