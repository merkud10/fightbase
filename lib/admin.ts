const translitMap: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z",
  и: "i", й: "j", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
};

function transliterate(text: string) {
  return text
    .split("")
    .map((ch) => translitMap[ch] ?? ch)
    .join("");
}

export function slugify(input: string) {
  return transliterate(input.toLowerCase().trim())
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function asOptionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function asRequiredString(value: FormDataEntryValue | null, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Field "${field}" is required`);
  }

  return value.trim();
}

export function asStringArray(values: FormDataEntryValue[]) {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function asRequiredNumber(value: FormDataEntryValue | null, field: string) {
  const parsed = Number(asRequiredString(value, field));

  if (Number.isNaN(parsed)) {
    throw new Error(`Field "${field}" must be a number`);
  }

  return parsed;
}

export function asOptionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value.trim());

  return Number.isNaN(parsed) ? null : parsed;
}
