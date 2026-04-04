import type { Metadata } from "next";

import { ArticleDetailPage, generateArticlePageMetadata } from "@/components/article-detail-page";

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return generateArticlePageMetadata(slug, "analysis");
}

export default async function AnalysisArticlePage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ArticleDetailPage slug={slug} category="analysis" />;
}
