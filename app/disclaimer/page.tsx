import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";

export default async function DisclaimerPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/disclaimer"
        title={locale === "ru" ? "Дисклеймер" : "Disclaimer"}
        description={
          locale === "ru"
            ? "Контент FightBase не должен восприниматься как беттинг-советы. AI-generated блоки должны быть прозрачны и привязаны к источникам."
            : "FightBase content should not be framed as betting advice. AI-generated blocks must be transparent and source-linked."
        }
      />
    </main>
  );
}
