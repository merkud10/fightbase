"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

const METRIKA_ID = 108511042;

function MetrikaPageHit() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.ym === "function") {
      window.ym(METRIKA_ID, "hit", window.location.href);
    }
  }, [pathname, searchParams]);

  return null;
}

export function YandexMetrikaHit() {
  return (
    <Suspense fallback={null}>
      <MetrikaPageHit />
    </Suspense>
  );
}
