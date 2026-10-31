// One counter for initialization, page views and goals.
export function resolveMetrikaId(value: string | undefined): number | null {
  const raw = (value || "108511042").trim();
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export const METRIKA_ID = resolveMetrikaId(process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID);
