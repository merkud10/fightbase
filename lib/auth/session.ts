const encoder = new TextEncoder();

export const adminSessionCookieName = "__fightbase_admin_session";
export const adminSessionLifetimeSeconds = 60 * 60 * 12;

export type AdminSessionRole = "admin";

export type AdminSessionPayload = {
  sub: string;
  email: string;
  role: AdminSessionRole;
  exp: number;
};

function toBase64Url(value: Uint8Array | string) {
  const input = typeof value === "string" ? encoder.encode(value) : value;
  const binary = Array.from(input, (chunk) => String.fromCharCode(chunk)).join("");
  const base64 = btoa(binary);

  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
}

export async function createAdminSessionToken(
  payload: Omit<AdminSessionPayload, "exp">,
  secret: string,
  lifetimeSeconds = adminSessionLifetimeSeconds
) {
  const body: AdminSessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + lifetimeSeconds
  };
  const encodedPayload = toBase64Url(JSON.stringify(body));
  const signature = await signValue(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export async function verifyAdminSessionToken(token: string, secret: string) {
  const [encodedPayload = "", encodedSignature = ""] = String(token || "").split(".");

  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const expectedSignature = await signValue(encodedPayload, secret);
  if (expectedSignature !== encodedSignature) {
    return null;
  }

  try {
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload))) as AdminSessionPayload;

    if (!decoded?.email || !decoded?.role || !decoded?.exp) {
      return null;
    }

    if (decoded.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}
