import crypto from "crypto";
import { NextResponse } from "next/server";

type WindowCounter = {
  count: number;
  expiresAt: number;
};

const rateLimitBuckets = new Map<string, WindowCounter>();

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function checkSimpleRateLimit(params: {
  request: Request;
  scope: string;
  maxRequests: number;
  windowMs: number;
}): NextResponse | null {
  const { request, scope, maxRequests, windowMs } = params;
  const ip = getClientIp(request);
  const now = Date.now();
  const key = `${scope}:${ip}`;
  const existing = rateLimitBuckets.get(key);

  if (!existing || now > existing.expiresAt) {
    rateLimitBuckets.set(key, { count: 1, expiresAt: now + windowMs });
    return null;
  }

  if (existing.count >= maxRequests) {
    return NextResponse.json({ error: "請求過於頻繁，請稍後再試" }, { status: 429 });
  }

  existing.count += 1;
  return null;
}

export function verifyOptionalSignature(params: {
  storeId: string;
  signature: string | null;
  ts: string | null;
}): NextResponse | null {
  const secret = process.env.PUBLIC_API_SIGNATURE_SECRET?.trim();
  if (!secret) return null;

  const { storeId, signature, ts } = params;
  if (!signature || !ts) {
    return NextResponse.json({ error: "缺少簽名參數" }, { status: 401 });
  }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) {
    return NextResponse.json({ error: "簽名時間格式錯誤" }, { status: 401 });
  }

  // 5 分鐘時效，避免簽名重放
  if (Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
    return NextResponse.json({ error: "簽名已過期" }, { status: 401 });
  }

  const raw = `${storeId}:${ts}`;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (signature !== expected) {
    return NextResponse.json({ error: "簽名驗證失敗" }, { status: 401 });
  }

  return null;
}
