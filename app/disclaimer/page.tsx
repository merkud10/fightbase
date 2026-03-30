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
            ? "Контент FightBase не должен восприниматься как беттинг-советы или финансовые рекомендации. Материалы публикуются в информационных целях."
            : "FightBase content should not be treated as betting advice or financial guidance. All materials are published for informational purposes."
        }
      />
    </main>
  );
}
