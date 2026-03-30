import Link from "next/link";

import type { Locale } from "@/lib/locale-config";
import { localizePath } from "@/lib/locale-path";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items, locale }: { items: BreadcrumbItem[]; locale: Locale }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol className="breadcrumbs-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="breadcrumbs-item">
              {item.href && !isLast ? <Link href={localizePath(item.href, locale)}>{item.label}</Link> : <span>{item.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
