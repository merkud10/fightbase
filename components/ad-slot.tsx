import { getAdPlacement, type AdPlacementKey } from "@/lib/ads";
import type { Locale } from "@/lib/locale-config";

type AdSlotProps = {
  placement: AdPlacementKey;
  locale: Locale;
  className?: string;
};

export function AdSlot({ placement, locale, className }: AdSlotProps) {
  const config = getAdPlacement(placement);

  if (!config.enabled) {
    return null;
  }

  const label = locale === "ru" ? config.labelRu : config.label;
  const title = locale === "ru" ? config.titleRu : config.title;
  const description = locale === "ru" ? config.descriptionRu : config.description;

  return (
    <aside className={`ad-slot ${className ?? ""}`.trim()} aria-label={label}>
      <div className="ad-slot-meta">
        <span className="ad-slot-badge">{locale === "ru" ? "Реклама" : "Sponsored"}</span>
        <span className="ad-slot-size">{config.size}</span>
      </div>
      <h3>{title}</h3>
      <p className="copy">{description}</p>
      <p className="ad-slot-footnote">
        {locale === "ru"
          ? "Сейчас это архитектурный placeholder: позже сюда можно подключить AdSense, прямого рекламодателя или affiliate-блок."
          : "This is an architectural placeholder for a future ad network, direct sponsor, or affiliate module."}
      </p>
    </aside>
  );
}
