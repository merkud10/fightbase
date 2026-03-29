import { AdSlot } from "@/components/ad-slot";
import { ArticleCard } from "@/components/cards";
import { PageHero } from "@/components/page-hero";
import { getNewsPageData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";

export default async function NewsPage() {
  const locale = await getLocale();
  const { promotions, tags, articles } = await getNewsPageData();

  return (
    <main className="container">
      <PageHero
        eyebrow="/news"
        title={locale === "ru" ? "Новости" : "News"}
        description={
          locale === "ru"
            ? "Основной трафиковый раздел с фильтрами, привязкой сущностей, источниками и будущей infinite-scroll лентой."
            : "The main traffic section with filters, entity linking, source transparency, and a future infinite-scroll feed."
        }
      />

      <section className="page-grid">
        <aside className="stack">
          <div className="filter-group">
            <h3>{locale === "ru" ? "Промоушены" : "Promotions"}</h3>
            {promotions.map((promotion) => (
              <span key={promotion.id}>{promotion.shortName}</span>
            ))}
          </div>
          <div className="filter-group">
            <h3>{locale === "ru" ? "Категории" : "Categories"}</h3>
            {tags.map((tag) => (
              <span key={tag.id}>{tag.label}</span>
            ))}
          </div>
          <div className="filter-group">
            <h3>{locale === "ru" ? "Инструменты" : "Workflow"}</h3>
            <span>{locale === "ru" ? "Поиск" : "Search"}</span>
            <span>{locale === "ru" ? "Сортировка" : "Sort"}</span>
            <span>{locale === "ru" ? "Что это значит" : "What this means"}</span>
            <span>{locale === "ru" ? "Связанные сущности" : "Related entities"}</span>
          </div>
          <AdSlot placement="newsSidebar" locale={locale} />
        </aside>

        <div className="story-grid">
          {articles.map((article, index) => (
            <div key={article.id} className="story-stack">
              <ArticleCard article={article} locale={locale} />
              {index === 2 ? <AdSlot placement="newsInline" locale={locale} className="story-card ad-slot-inline" /> : null}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
