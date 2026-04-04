import type { Metadata } from "next";

export const revalidate = 3600;

import { ArticleDetailPage, generateArticlePageMetadata } from "@/components/article-detail-page";

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return generateArticlePageMetadata(slug, "interview");
}

export default async function QuoteArticlePage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ArticleDetailPage slug={slug} category="interview" />;
}
