import { scryptSync, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  adminSessionCookieName,
  adminSessionLifetimeSeconds,
  createAdminSessionToken,
  type AdminSessionPayload,
  verifyAdminSessionToken
} from "@/lib/auth/session";

function getRequiredAuthSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();

  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is not configured");
  }

  return secret;
}

function getConfiguredAdminEmail() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!email) {
    throw new Error("ADMIN_EMAIL is not configured");
  }

  return email;
}

function verifyPasswordHash(input: string, configuredHash: string) {
  const [scheme = "", salt = "", hashHex = ""] = configuredHash.split("$");
  if (scheme !== "scrypt" || !salt || !hashHex) {
    return false;
  }

  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(input, salt, expected.length);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyConfiguredAdminCredentials(email: string, password: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const inputPassword = String(password || "");

  if (!normalizedEmail || !inputPassword) {
    return false;
  }

  if (normalizedEmail !== getConfiguredAdminEmail()) {
    return false;
  }

  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (passwordHash) {
    return verifyPasswordHash(inputPassword, passwordHash);
  }

  const passwordPlain = process.env.ADMIN_PASSWORD ?? "";
  return passwordPlain.length > 0 && passwordPlain === inputPassword;
}

export async function createAdminSession(email: string) {
  const secret = getRequiredAuthSecret();

  return createAdminSessionToken(
    {
      sub: email.toLowerCase(),
      email: email.toLowerCase(),
      role: "admin"
    },
    secret,
    adminSessionLifetimeSeconds
  );
}

export async function persistAdminSession(email: string) {
  const token = await createAdminSession(email);
  const cookieStore = await cookies();

  cookieStore.set(adminSessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: adminSessionLifetimeSeconds
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(adminSessionCookieName);
}

export async function getAdminSessionFromCookies(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminSessionCookieName)?.value;

  if (!token) {
    return null;
  }

  return verifyAdminSessionToken(token, getRequiredAuthSecret());
}

export async function requireAdminSession(nextPath = "/admin") {
  const session = await getAdminSessionFromCookies();

  if (!session) {
    redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`);
  }

  return session;
}
