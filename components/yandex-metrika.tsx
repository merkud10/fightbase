"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { METRIKA_ID } from "@/lib/metrika-config";

function MetrikaPageHit() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (METRIKA_ID && typeof window !== "undefined" && typeof window.ym === "function") {
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
