"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminSession } from "@/lib/auth/server";
import { asOptionalNumber, asOptionalString, asRequiredNumber, asRequiredString, asStringArray, slugify } from "@/lib/admin";
import { backgroundJobTypes, enqueueBackgroundJob } from "@/lib/background-jobs";
import { createDraftFromIngestion } from "@/lib/ingestion";
import { prisma } from "@/lib/prisma";
import {
  publishArticleToTelegram,
  publishArticleToVk
} from "@/lib/social-publish";
import {
  ArticleCategorySchema,
  ArticleStatusSchema,
  EventStatusSchema,
  FighterStatusSchema,
  SourceTypeSchema
} from "@/lib/validation";

const execFileAsync = promisify(execFile);

function articleSectionsFromBody(body: string) {
  return [
    {
      heading: "Main section",
      body,
      sortOrder: 1
    }
  ];
}

async function assertAdminAccess() {
  await requireAdminSession("/admin");
}

export async function createArticleAction(formData: FormData) {
  await assertAdminAccess();
  const title = asRequiredString(formData.get("title"), "title");
  const excerpt = asRequiredString(formData.get("excerpt"), "excerpt");
  const meaning = asRequiredString(formData.get("meaning"), "meaning");
  const body = asRequiredString(formData.get("body"), "body");
  const category = ArticleCategorySchema.parse(formData.get("category"));
  const status = ArticleStatusSchema.parse(formData.get("status"));
  const publishedAt = asRequiredString(formData.get("publishedAt"), "publishedAt");
  const aiConfidence = asOptionalNumber(formData.get("aiConfidence"));
  const ingestionSourceSummary = asOptionalString(formData.get("ingestionSourceSummary"));
  const ingestionNotes = asOptionalString(formData.get("ingestionNotes"));
  const slugInput = asOptionalString(formData.get("slug"));
  const promotionId = asOptionalString(formData.get("promotionId"));
  const eventId = asOptionalString(formData.get("eventId"));
  const tagIds = asStringArray(formData.getAll("tagIds"));
  const fighterIds = asStringArray(formData.getAll("fighterIds"));
  const sourceIds = asStringArray(formData.getAll("sourceIds"));

  const slug = slugInput ?? slugify(title);

  const article = await prisma.article.create({
    data: {
      slug,
      title,
      excerpt,
      meaning,
      category,
      status,
      aiConfidence,
      ingestionSourceSummary,
      ingestionNotes,
      publishedAt: new Date(publishedAt),
      promotionId,
      eventId,
      sections: {
        create: articleSectionsFromBody(body)
      },
      tagMap: {
        create: tagIds.map((tagId) => ({ tagId }))
      },
      fighterMap: {
        create: fighterIds.map((fighterId) => ({ fighterId }))
      },
      sourceMap: {
        create: sourceIds.map((sourceId) => ({ sourceId }))
      }
    }
  });

  revalidatePath("/admin");
  revalidatePath("/news");
  revalidatePath("/");
  redirect(`/admin/articles/${article.id}`);
}

export async function updateArticleAction(articleId: string, formData: FormData) {
  await assertAdminAccess();
  const title = asRequiredString(formData.get("title"), "title");
  const excerpt = asRequiredString(formData.get("excerpt"), "excerpt");
  const meaning = asRequiredString(formData.get("meaning"), "meaning");
  const body = asRequiredString(formData.get("body"), "body");
  const category = ArticleCategorySchema.parse(formData.get("category"));
  const status = ArticleStatusSchema.parse(formData.get("status"));
  const publishedAt = asRequiredString(formData.get("publishedAt"), "publishedAt");
  const aiConfidence = asOptionalNumber(formData.get("aiConfidence"));
  const ingestionSourceSummary = asOptionalString(formData.get("ingestionSourceSummary"));
  const ingestionNotes = asOptionalString(formData.get("ingestionNotes"));
  const slugInput = asOptionalString(formData.get("slug"));
  const promotionId = asOptionalString(formData.get("promotionId"));
  const eventId = asOptionalString(formData.get("eventId"));
  const tagIds = asStringArray(formData.getAll("tagIds"));
  const fighterIds = asStringArray(formData.getAll("fighterIds"));
  const sourceIds = asStringArray(formData.getAll("sourceIds"));

  const slug = slugInput ?? slugify(title);

  const existingArticle = await prisma.article.findUnique({
    where: { id: articleId },
    select: { status: true }
  });

  if (!existingArticle) {
    throw new Error("Article not found.");
  }

  const wasPublished = existingArticle.status === "published";

  await prisma.$transaction([
    prisma.articleTag.deleteMany({ where: { articleId } }),
    prisma.articleFighter.deleteMany({ where: { articleId } }),
    prisma.articleSource.deleteMany({ where: { articleId } }),
    prisma.articleSection.deleteMany({ where: { articleId } }),
    prisma.article.update({
      where: { id: articleId },
      data: {
        slug,
        title,
        excerpt,
        meaning,
        category,
        status,
        aiConfidence,
        ingestionSourceSummary,
        ingestionNotes,
        publishedAt: new Date(publishedAt),
        promotionId,
        eventId,
        sections: {
          create: articleSectionsFromBody(body)
        },
        tagMap: {
          create: tagIds.map((tagId) => ({ tagId }))
        },
        fighterMap: {
          create: fighterIds.map((fighterId) => ({ fighterId }))
        },
        sourceMap: {
          create: sourceIds.map((sourceId) => ({ sourceId }))
        }
      }
    })
  ]);

  revalidatePath("/admin");
  revalidatePath("/news");
  revalidatePath("/");
  redirect(`/admin/articles/${articleId}`);
}

export async function deleteArticleAction(formData: FormData) {
  await assertAdminAccess();
  const articleId = asRequiredString(formData.get("articleId"), "articleId");
  const returnTo = asOptionalString(formData.get("returnTo")) ?? "/admin";

  await prisma.$transaction([
    prisma.articleTag.deleteMany({ where: { articleId } }),
    prisma.articleFighter.deleteMany({ where: { articleId } }),
    prisma.articleSource.deleteMany({ where: { articleId } }),
    prisma.articleSection.deleteMany({ where: { articleId } }),
    prisma.article.delete({ where: { id: articleId } })
  ]);

  revalidatePath("/admin");
  revalidatePath("/news");
  revalidatePath("/");
  redirect(returnTo);
}

export async function bulkUpdateArticleStatusAction(formData: FormData) {
  await assertAdminAccess();
  const articleIds = asStringArray(formData.getAll("articleIds"));
  const targetStatus = ArticleStatusSchema.parse(formData.get("targetStatus"));
  const currentStatus = asOptionalString(formData.get("currentStatus"));

  if (articleIds.length === 0) {
    redirect(`/admin${currentStatus ? `?status=${currentStatus}&bulkUpdate=empty` : "?bulkUpdate=empty"}`);
  }

  await prisma.article.updateMany({
    where: {
      id: {
        in: articleIds
      }
    },
    data: {
      status: targetStatus
    }
  });

  revalidatePath("/admin");
  revalidatePath("/news");
  revalidatePath("/");

  const query = new URLSearchParams();
  if (currentStatus) {
    query.set("status", currentStatus);
  }
  query.set("bulkUpdate", `${targetStatus}:${articleIds.length}`);

  redirect(`/admin?${query.toString()}`);
}

export async function quickUpdateArticleStatusAction(formData: FormData) {
  await assertAdminAccess();
  const articleId = asRequiredString(formData.get("articleId"), "articleId");
  const targetStatus = ArticleStatusSchema.parse(formData.get("targetStatus"));
  const returnTo = asOptionalString(formData.get("returnTo")) ?? "/admin";

  await prisma.article.update({
    where: { id: articleId },
    data: {
      status: targetStatus
    }
  });

  revalidatePath("/admin");
  revalidatePath("/news");
  revalidatePath("/");
  redirect(returnTo);
}

export async function deactivateBrowserPushSubscriptionAction(formData: FormData) {
  await assertAdminAccess();
  const subscriptionId = asRequiredString(formData.get("subscriptionId"), "subscriptionId");
  const returnTo = asOptionalString(formData.get("returnTo")) ?? "/admin";

  await prisma.browserPushSubscription.update({
    where: { id: subscriptionId },
    data: {
      isActive: false,
      lastSeenAt: new Date()
    }
  });

  revalidatePath("/admin");
  redirect(returnTo);
}

export async function runBackgroundJobsNowAction(formData: FormData) {
  await assertAdminAccess();
  const returnTo = asOptionalString(formData.get("returnTo")) ?? "/admin";
  const limit = asOptionalNumber(formData.get("limit")) ?? 5;

  try {
    const result = await execFileAsync(process.execPath, ["scripts/process-background-jobs.js", "--limit", String(limit)], {
      cwd: process.cwd(),
      timeout: 240_000
    });

    revalidatePath("/admin");
    redirect(
      appendAdminResult(
        returnTo,
        "jobRun",
        `success:${encodeURIComponent(result.stdout?.trim() || `Processed background jobs: ${limit}`)}`
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Background jobs worker failed.";
    revalidatePath("/admin");
    redirect(appendAdminResult(returnTo, "jobRun", `error:${encodeURIComponent(message)}`));
  }
}

export async function enqueueBackgroundJobAction(formData: FormData) {
  await assertAdminAccess();
  const returnTo = asOptionalString(formData.get("returnTo")) ?? "/admin";
  const jobTypeRaw = asRequiredString(formData.get("jobType"), "jobType");
  const priority = asOptionalNumber(formData.get("priority")) ?? undefined;
  const limit = asOptionalNumber(formData.get("limit")) ?? undefined;
  const lookbackHours = asOptionalNumber(formData.get("lookbackHours")) ?? undefined;
  const file = asOptionalString(formData.get("file")) ?? undefined;
  const status = asOptionalString(formData.get("status")) ?? undefined;
  const dryRun = asOptionalString(formData.get("dryRun")) === "1";

  const jobType = backgroundJobTypes.find((entry) => entry === jobTypeRaw);

  if (!jobType) {
    redirect(appendAdminResult(returnTo, "jobQueue", "error:Unsupported%20job%20type"));
  }

  try {
    const job = await enqueueBackgroundJob({
      type: jobType,
      priority,
      payload: {
        baseUrl: process.env.INGEST_BASE_URL || "http://localhost:3000",
        limit,
        lookbackHours,
        file,
        status,
        dryRun
      }
    });

    revalidatePath("/admin");
    redirect(appendAdminResult(returnTo, "jobQueue", `success:${encodeURIComponent(`${jobType}:${job.id}`)}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue background job.";
    revalidatePath("/admin");
    redirect(appendAdminResult(returnTo, "jobQueue", `error:${encodeURIComponent(message)}`));
  }
}

function appendAdminResult(returnTo: string, key: string, value: string) {
  const url = new URL(returnTo, "http://localhost");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

export async function publishArticleToTelegramAction(formData: FormData) {
  await assertAdminAccess();
  const articleId = asRequiredString(formData.get("articleId"), "articleId");
  const returnTo = asOptionalString(formData.get("returnTo")) ?? "/admin";

  try {
    await publishArticleToTelegram(articleId);
    redirect(appendAdminResult(returnTo, "socialPost", "telegram:success"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram publishing failed.";
    redirect(appendAdminResult(returnTo, "socialPost", `telegram:error:${encodeURIComponent(message)}`));
  }
}

export async function publishArticleToVkAction(formData: FormData) {
  await assertAdminAccess();
  const articleId = asRequiredString(formData.get("articleId"), "articleId");
  const returnTo = asOptionalString(formData.get("returnTo")) ?? "/admin";

  try {
    await publishArticleToVk(articleId);
    redirect(appendAdminResult(returnTo, "socialPost", "vk:success"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "VK publishing failed.";
    redirect(appendAdminResult(returnTo, "socialPost", `vk:error:${encodeURIComponent(message)}`));
  }
}

export async function ingestDraftArticleAction(formData: FormData) {
  await assertAdminAccess();
  const headline = asRequiredString(formData.get("headline"), "headline");
  const body = asRequiredString(formData.get("body"), "body");
  const sourceLabel = asRequiredString(formData.get("sourceLabel"), "sourceLabel");
  const sourceUrl = asRequiredString(formData.get("sourceUrl"), "sourceUrl");
  const publishedAt = asOptionalString(formData.get("publishedAt")) ?? new Date().toISOString();
  const category = asOptionalString(formData.get("category")) ?? "news";

  const fighterSlugs = (asOptionalString(formData.get("fighterSlugs")) ?? "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);

  const tagSlugs = (asOptionalString(formData.get("tagSlugs")) ?? "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);

  const result = await createDraftFromIngestion({
    headline,
    body,
    publishedAt,
    sourceLabel,
    sourceUrl,
    category: ArticleCategorySchema.parse(category),
    fighterSlugs,
    tagSlugs
  });

  revalidatePath("/admin");
  revalidatePath("/news");
  revalidatePath("/");
  redirect(`/admin/articles/${result.articleId}`);
}

export async function createSourceAction(formData: FormData) {
  await assertAdminAccess();
  const label = asRequiredString(formData.get("label"), "label");
  const type = SourceTypeSchema.parse(formData.get("type"));
  const url = asRequiredString(formData.get("url"), "url");
  const slug = asOptionalString(formData.get("slug")) ?? slugify(label);

  const source = await prisma.source.create({
    data: {
      slug,
      label,
      type,
      url
    }
  });

  revalidatePath("/admin");
  redirect(`/admin/sources/${source.id}`);
}

export async function updateSourceAction(sourceId: string, formData: FormData) {
  await assertAdminAccess();
  const label = asRequiredString(formData.get("label"), "label");
  const type = SourceTypeSchema.parse(formData.get("type"));
  const url = asRequiredString(formData.get("url"), "url");
  const slug = asOptionalString(formData.get("slug")) ?? slugify(label);

  await prisma.source.update({
    where: { id: sourceId },
    data: {
      slug,
      label,
      type,
      url
    }
  });

  revalidatePath("/admin");
  redirect(`/admin/sources/${sourceId}`);
}

export async function deleteSourceAction(formData: FormData) {
  await assertAdminAccess();
  const sourceId = asRequiredString(formData.get("sourceId"), "sourceId");

  await prisma.source.delete({
    where: { id: sourceId }
  });

  revalidatePath("/admin");
  redirect("/admin");
}

export async function createFighterAction(formData: FormData) {
  await assertAdminAccess();
  const name = asRequiredString(formData.get("name"), "name");
  const nameRu = asOptionalString(formData.get("nameRu"));
  const nickname = asOptionalString(formData.get("nickname"));
  const photoUrl = asOptionalString(formData.get("photoUrl"));
  const country = asRequiredString(formData.get("country"), "country");
  const weightClass = asRequiredString(formData.get("weightClass"), "weightClass");
  const status = FighterStatusSchema.parse(formData.get("status"));
  const record = asRequiredString(formData.get("record"), "record");
  const age = asRequiredNumber(formData.get("age"), "age");
  const heightCm = asRequiredNumber(formData.get("heightCm"), "heightCm");
  const reachCm = asRequiredNumber(formData.get("reachCm"), "reachCm");
  const team = asRequiredString(formData.get("team"), "team");
  const style = asRequiredString(formData.get("style"), "style");
  const bio = asRequiredString(formData.get("bio"), "bio");
  const promotionId = asRequiredString(formData.get("promotionId"), "promotionId");
  const slug = asOptionalString(formData.get("slug")) ?? slugify(name);

  const fighter = await prisma.fighter.create({
    data: {
      slug,
      name,
      nameRu,
      nickname,
      photoUrl,
      country,
      weightClass,
      status,
      record,
      age,
      heightCm,
      reachCm,
      team,
      style,
      bio,
      promotionId
    }
  });

  revalidatePath("/admin");
  revalidatePath("/fighters");
  redirect(`/admin/fighters/${fighter.id}`);
}

export async function updateFighterAction(fighterId: string, formData: FormData) {
  await assertAdminAccess();
  const name = asRequiredString(formData.get("name"), "name");
  const nameRu = asOptionalString(formData.get("nameRu"));
  const nickname = asOptionalString(formData.get("nickname"));
  const photoUrl = asOptionalString(formData.get("photoUrl"));
  const country = asRequiredString(formData.get("country"), "country");
  const weightClass = asRequiredString(formData.get("weightClass"), "weightClass");
  const status = FighterStatusSchema.parse(formData.get("status"));
  const record = asRequiredString(formData.get("record"), "record");
  const age = asRequiredNumber(formData.get("age"), "age");
  const heightCm = asRequiredNumber(formData.get("heightCm"), "heightCm");
  const reachCm = asRequiredNumber(formData.get("reachCm"), "reachCm");
  const team = asRequiredString(formData.get("team"), "team");
  const style = asRequiredString(formData.get("style"), "style");
  const bio = asRequiredString(formData.get("bio"), "bio");
  const promotionId = asRequiredString(formData.get("promotionId"), "promotionId");
  const slug = asOptionalString(formData.get("slug")) ?? slugify(name);

  await prisma.fighter.update({
    where: { id: fighterId },
    data: {
      slug,
      name,
      nameRu,
      nickname,
      photoUrl,
      country,
      weightClass,
      status,
      record,
      age,
      heightCm,
      reachCm,
      team,
      style,
      bio,
      promotionId
    }
  });

  revalidatePath("/admin");
  revalidatePath("/fighters");
  redirect(`/admin/fighters/${fighterId}`);
}

export async function deleteFighterAction(formData: FormData) {
  await assertAdminAccess();
  const fighterId = asRequiredString(formData.get("fighterId"), "fighterId");
  const fightCount = await prisma.fight.count({
    where: {
      OR: [{ fighterAId: fighterId }, { fighterBId: fighterId }]
    }
  });

  if (fightCount > 0) {
    redirect("/admin?fighterDelete=blocked");
  }

  await prisma.fighter.delete({
    where: { id: fighterId }
  });

  revalidatePath("/admin");
  revalidatePath("/fighters");
  redirect("/admin");
}

export async function createEventAction(formData: FormData) {
  await assertAdminAccess();
  const name = asRequiredString(formData.get("name"), "name");
  const date = asRequiredString(formData.get("date"), "date");
  const city = asRequiredString(formData.get("city"), "city");
  const venue = asRequiredString(formData.get("venue"), "venue");
  const status = EventStatusSchema.parse(formData.get("status"));
  const summary = asRequiredString(formData.get("summary"), "summary");
  const promotionId = asRequiredString(formData.get("promotionId"), "promotionId");
  const slug = asOptionalString(formData.get("slug")) ?? slugify(name);

  const event = await prisma.event.create({
    data: {
      slug,
      name,
      date: new Date(date),
      city,
      venue,
      status,
      summary,
      promotionId
    }
  });

  revalidatePath("/admin");
  revalidatePath("/events");
  redirect(`/admin/events/${event.id}`);
}

export async function updateEventAction(eventId: string, formData: FormData) {
  await assertAdminAccess();
  const name = asRequiredString(formData.get("name"), "name");
  const date = asRequiredString(formData.get("date"), "date");
  const city = asRequiredString(formData.get("city"), "city");
  const venue = asRequiredString(formData.get("venue"), "venue");
  const status = EventStatusSchema.parse(formData.get("status"));
  const summary = asRequiredString(formData.get("summary"), "summary");
  const promotionId = asRequiredString(formData.get("promotionId"), "promotionId");
  const slug = asOptionalString(formData.get("slug")) ?? slugify(name);

  await prisma.event.update({
    where: { id: eventId },
    data: {
      slug,
      name,
      date: new Date(date),
      city,
      venue,
      status,
      summary,
      promotionId
    }
  });

  revalidatePath("/admin");
  revalidatePath("/events");
  redirect(`/admin/events/${eventId}`);
}

export async function deleteEventAction(formData: FormData) {
  await assertAdminAccess();
  const eventId = asRequiredString(formData.get("eventId"), "eventId");
  const [fightCount, articleCount] = await Promise.all([
    prisma.fight.count({ where: { eventId } }),
    prisma.article.count({ where: { eventId } })
  ]);

  if (fightCount > 0 || articleCount > 0) {
    redirect("/admin?eventDelete=blocked");
  }

  await prisma.event.delete({
    where: { id: eventId }
  });

  revalidatePath("/admin");
  revalidatePath("/events");
  redirect("/admin");
}

export async function createTagAction(formData: FormData) {
  await assertAdminAccess();
  const label = asRequiredString(formData.get("label"), "label");
  const slug = asOptionalString(formData.get("slug")) ?? slugify(label);

  const tag = await prisma.tag.create({
    data: {
      slug,
      label
    }
  });

  revalidatePath("/admin");
  redirect(`/admin/tags/${tag.id}`);
}

export async function updateTagAction(tagId: string, formData: FormData) {
  await assertAdminAccess();
  const label = asRequiredString(formData.get("label"), "label");
  const slug = asOptionalString(formData.get("slug")) ?? slugify(label);

  await prisma.tag.update({
    where: { id: tagId },
    data: {
      slug,
      label
    }
  });

  revalidatePath("/admin");
  redirect(`/admin/tags/${tagId}`);
}

export async function deleteTagAction(formData: FormData) {
  await assertAdminAccess();
  const tagId = asRequiredString(formData.get("tagId"), "tagId");
  const articleCount = await prisma.articleTag.count({
    where: { tagId }
  });

  if (articleCount > 0) {
    redirect("/admin?tagDelete=blocked");
  }

  await prisma.tag.delete({
    where: { id: tagId }
  });

  revalidatePath("/admin");
  redirect("/admin");
}
