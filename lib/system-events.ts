import { prisma } from "@/lib/prisma";

type SystemEventInput = {
  level: "info" | "warn" | "error";
  category: string;
  message: string;
  source?: string;
  requestId?: string;
  path?: string;
  ipAddress?: string;
  meta?: Record<string, unknown>;
};

export async function recordSystemEvent(input: SystemEventInput) {
  try {
    const event = await prisma.systemEvent.create({
      data: {
        level: input.level,
        category: input.category,
        message: input.message,
        source: input.source,
        requestId: input.requestId,
        path: input.path,
        ipAddress: input.ipAddress,
        meta: input.meta ? JSON.stringify(input.meta) : null
      }
    });

    const shouldQueueTelegramAlert =
      input.level === "error" &&
      input.category !== "alerts.telegram" &&
      Boolean(process.env.TELEGRAM_BOT_TOKEN) &&
      Boolean(process.env.TELEGRAM_ALERTS_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID);

    if (shouldQueueTelegramAlert) {
      const existingJob = await prisma.backgroundJob.findFirst({
        where: {
          type: "operational-alerts",
          status: {
            in: ["queued", "running"]
          }
        },
        select: {
          id: true
        }
      });

      if (!existingJob) {
        await prisma.backgroundJob.create({
          data: {
            type: "operational-alerts",
            payload: JSON.stringify({
              reasonEventId: event.id
            }),
            priority: 5,
            maxAttempts: 5,
            runAt: new Date()
          }
        });
      }
    }
  } catch {
    // Do not throw from observability writes.
  }
}
