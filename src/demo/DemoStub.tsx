import { Link, useLocation } from "react-router-dom";
import { EmptyState, PageShell } from "../components/admin/primitives";

/** Демо: поза дашбордом мережі даних немає — пояснюємо, що відкрилося б у програмі. */
export function DemoStub() {
  const { pathname } = useLocation();
  return (
    <PageShell title="Демо-версія">
      <EmptyState title="У демо доступний лише дашборд мережі">
        У програмі тут відкриється сторінка <code>{pathname}</code> з даними обраної філії.{" "}
        <Link className="link" to="/main-branch">← Повернутися до мережі</Link>
      </EmptyState>
    </PageShell>
  );
}
