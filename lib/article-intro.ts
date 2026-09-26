const compact = (text: string) => text.replace(/\s+/g, " ").trim();

export function buildArticleExcerpt(text: string, maxLength = 400) {
  const normalized = compact(text);
  if (normalized.length <= maxLength) return normalized;
  const sentences = [...new Intl.Segmenter("ru", { granularity: "sentence" }).segment(normalized)];
  let end = 0;
  for (const sentence of sentences) {
    const next = sentence.index + sentence.segment.trimEnd().length;
    if (next > maxLength) break;
    end = next;
  }
  if (end > 0) return normalized.slice(0, end);
  const fragment = normalized.slice(0, maxLength - 1);
  const boundary = fragment.lastIndexOf(" ");
  return `${fragment.slice(0, boundary > 0 ? boundary : fragment.length).trimEnd()}…`;
}

export function prepareArticleIntro<T extends { body: string }>(excerpt: string, sections: T[]) {
  const index = sections.findIndex((section) => section.body.trim());
  if (index < 0) return { lead: /(?:\.{3}|…)\s*$/.test(excerpt) ? undefined : excerpt, sections };
  const body = sections[index]!.body.trimStart();
  const normalizedExcerpt = compact(excerpt).replace(/(?:\.{3}|…)$/, "").trim();
  const repeatsBody = normalizedExcerpt.length > 0 && compact(body).startsWith(normalizedExcerpt);
  if (!repeatsBody && !/(?:\.{3}|…)\s*$/.test(excerpt)) return { lead: excerpt, sections };

  // Promote complete opening sentences rather than a card's truncated prefix.
  // Work on the original string so no characters disappear from the body.
  const paragraph = body.split(/\n\s*\n/)[0] ?? body;
  let end = 0;
  for (const sentence of new Intl.Segmenter("ru", { granularity: "sentence" }).segment(paragraph)) {
    const next = sentence.index + sentence.segment.trimEnd().length;
    if (next > 500 || !/[.!?][»”"')]*$/.test(sentence.segment.trim())) break;
    end = next;
  }
  if (end === 0) return { lead: undefined, sections };
  return {
    lead: body.slice(0, end),
    sections: sections.map((section, i) => i === index ? { ...section, body: body.slice(end).trimStart() } : section)
  };
}
