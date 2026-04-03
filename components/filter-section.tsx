import Link from "next/link";

type FilterItem = {
  label: string;
  value: string;
};

export function buildFilterHref(
  basePath: string,
  current: Record<string, string>,
  next: Record<string, string>
) {
  const params = new URLSearchParams();
  const merged = { ...current, ...next };

  for (const [key, value] of Object.entries(merged)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function FilterSection({
  title,
  items,
  activeValue,
  basePath,
  current,
  param,
  allLabel = "Все"
}: {
  title: string;
  items: FilterItem[];
  activeValue: string;
  basePath: string;
  current: Record<string, string>;
  param: string;
  allLabel?: string;
}) {
  return (
    <div className="filter-block">
      <h4>{title}</h4>
      <div className="filter-chip-row">
        <Link
          href={buildFilterHref(basePath, current, { [param]: "" })}
          className={`filter-chip ${activeValue === "" ? "active" : ""}`}
        >
          {allLabel}
        </Link>
        {items.map((item) => (
          <Link
            key={item.value}
            href={buildFilterHref(basePath, current, {
              [param]: activeValue === item.value ? "" : item.value
            })}
            className={`filter-chip ${activeValue === item.value ? "active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function FilterEmptyState({
  heading,
  description
}: {
  heading: string;
  description: string;
}) {
  return (
    <section className="filter-empty-state">
      <h3>{heading}</h3>
      <p className="copy">{description}</p>
    </section>
  );
}
