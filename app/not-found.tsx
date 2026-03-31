import Link from "next/link";

import { getLocale } from "@/lib/i18n";
import { localizePath } from "@/lib/locale-path";

export default async function NotFound() {
  const locale = await getLocale();

  return (
    <main className="container">
      <section className="filter-empty-state" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <h1>{locale === "ru" ? "404 — страница не найдена" : "404 — page not found"}</h1>
        <p className="copy">
          {locale === "ru"
            ? "Запрашиваемая страница не существует или была удалена."
            : "The requested page does not exist or has been removed."}
        </p>
        <Link href={localizePath("/", locale)} className="button-secondary">
          {locale === "ru" ? "На главную" : "Go home"}
        </Link>
      </section>
    </main>
  );
}
