export type AdPlacementKey =
  | "homeHero"
  | "homeFeed"
  | "newsSidebar"
  | "newsInline"
  | "articleInline"
  | "articleSidebar";

type AdPlacement = {
  key: AdPlacementKey;
  label: string;
  labelRu: string;
  title: string;
  titleRu: string;
  description: string;
  descriptionRu: string;
  size: string;
  enabled: boolean;
};

const adsEnabled = process.env.NEXT_PUBLIC_ADS_ENABLED === "1";

export const adPlacements: Record<AdPlacementKey, AdPlacement> = {
  homeHero: {
    key: "homeHero",
    label: "Sponsored spotlight",
    labelRu: "Партнерский блок",
    title: "Hero sponsorship placement",
    titleRu: "Партнерский слот в hero-зоне",
    description: "Premium homepage placement for a launch partner, event sponsor, or editorial integration.",
    descriptionRu: "Премиальное место на главной для launch-партнера, спонсора турнира или нативной интеграции.",
    size: "desktop billboard",
    enabled: adsEnabled
  },
  homeFeed: {
    key: "homeFeed",
    label: "Native partner slot",
    labelRu: "Нативный партнерский слот",
    title: "Homepage feed ad",
    titleRu: "Нативный блок в ленте главной",
    description: "Native slot between editorial sections with sponsorship markup and click tracking.",
    descriptionRu: "Нативное размещение между редакционными секциями с маркировкой рекламы и трекингом переходов.",
    size: "responsive horizontal",
    enabled: adsEnabled
  },
  newsSidebar: {
    key: "newsSidebar",
    label: "News sidebar ad",
    labelRu: "Реклама в сайдбаре",
    title: "News section placement",
    titleRu: "Размещение в сайдбаре новостей",
    description: "Reserved for network ads, direct banner deals, or affiliate widgets.",
    descriptionRu: "Подходит для рекламной сети, прямых баннерных размещений или партнерских виджетов.",
    size: "sidebar rectangle",
    enabled: adsEnabled
  },
  newsInline: {
    key: "newsInline",
    label: "Inline partner card",
    labelRu: "Встроенная партнерская карточка",
    title: "Inline news feed sponsorship",
    titleRu: "Нативное размещение внутри ленты новостей",
    description: "Appears inside the news flow and can later be backed by AdSense or direct inventory.",
    descriptionRu: "Появляется внутри ленты новостей и позже может быть подключено к AdSense или прямым продажам.",
    size: "feed card",
    enabled: adsEnabled
  },
  articleInline: {
    key: "articleInline",
    label: "Article sponsor block",
    labelRu: "Спонсорский блок статьи",
    title: "In-article monetization slot",
    titleRu: "Рекламный слот внутри статьи",
    description: "For native sponsorship, affiliate modules, or future ad-network code snippets.",
    descriptionRu: "Под нативную интеграцию, affiliate-модуль или будущий код рекламной сети.",
    size: "article inline",
    enabled: adsEnabled
  },
  articleSidebar: {
    key: "articleSidebar",
    label: "Sticky sidebar partner",
    labelRu: "Партнерский sticky-блок",
    title: "Article sidebar placement",
    titleRu: "Боковой рекламный слот статьи",
    description: "Supports sticky desktop inventory and a simplified mobile version.",
    descriptionRu: "Поддерживает sticky-размещение на десктопе и упрощенную мобильную версию.",
    size: "sidebar sticky",
    enabled: adsEnabled
  }
};

export function getAdPlacement(key: AdPlacementKey) {
  return adPlacements[key];
}
