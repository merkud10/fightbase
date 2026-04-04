import type { Metadata } from "next";

export const revalidate = 300;

import { ArticleDetailPage, generateArticlePageMetadata } from "@/components/article-detail-page";

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return generateArticlePageMetadata(slug, "news");
}

export default async function ArticlePage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ArticleDetailPage slug={slug} category="news" />;
}
