import { NextResponse } from "next/server";

function getPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
}

export async function GET() {
  const publicKey = getPublicKey();

  return NextResponse.json({
    ok: true,
    enabled: Boolean(publicKey),
    publicKey: publicKey || null
  });
}
