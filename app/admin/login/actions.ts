"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { clearAdminSession, persistAdminSession, verifyConfiguredAdminCredentials } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

function safeNextPath(value: FormDataEntryValue | null) {
  const next = String(value || "").trim();

  if (!next.startsWith("/")) {
    return "/admin";
  }

  if (next.startsWith("//")) {
    return "/admin";
  }

  return next;
}

function getRequestIpFromHeaders(headerStore: Headers) {
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }

  return headerStore.get("x-real-ip") || headerStore.get("cf-connecting-ip") || null;
}

export async function adminLoginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const nextPath = safeNextPath(formData.get("next"));
  const normalizedEmail = email.toLowerCase();
  const headerStore = await headers();
  const ipAddress = getRequestIpFromHeaders(headerStore);
  const userAgent = headerStore.get("user-agent");

  if (!verifyConfiguredAdminCredentials(email, password)) {
    await prisma.adminLoginAudit.create({
      data: {
        email: normalizedEmail || "unknown",
        attemptedEmail: normalizedEmail || null,
        wasSuccessful: false,
        ipAddress,
        userAgent
      }
    });
    redirect(`/admin/login?error=invalid&next=${encodeURIComponent(nextPath)}`);
  }

  await prisma.adminLoginAudit.create({
    data: {
      email: normalizedEmail,
      attemptedEmail: normalizedEmail,
      wasSuccessful: true,
      ipAddress,
      userAgent
    }
  });

  await persistAdminSession(email);
  redirect(nextPath);
}

export async function adminLogoutAction() {
  await clearAdminSession();
  redirect("/admin/login");
}
