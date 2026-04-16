import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getR2BucketName, getR2Client, getR2PublicBaseUrl } from "@/lib/r2";
import { Role } from "@/lib/types";

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

type PresignBody = {
  fileName?: string;
  contentType?: string;
  fileSize?: number;
  menuItemId?: string;
};

function guessExtension(contentType: string, fileName?: string): string {
  const lowerName = (fileName ?? "").toLowerCase();
  if (lowerName.endsWith(".webp")) return "webp";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "jpg";
  if (lowerName.endsWith(".png")) return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/jpeg") return "jpg";
  return "png";
}

function formatDayKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== Role.MANAGER && session.user.role !== Role.STAFF) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const brandId = session.user.brandId;
  const storeId = session.user.storeId;
  if (!brandId || !storeId) {
    return NextResponse.json({ error: "Store/brand not found for user" }, { status: 400 });
  }

  let body: PresignBody = {};
  try {
    body = (await request.json()) as PresignBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contentType = (body.contentType ?? "").trim().toLowerCase();
  const fileSize = Number(body.fileSize ?? 0);
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: "Only image/webp, image/jpeg, image/png are allowed" },
      { status: 400 }
    );
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_IMAGE_SIZE_BYTES) {
    return NextResponse.json({ error: "Image must be <= 2MB" }, { status: 400 });
  }

  const ext = guessExtension(contentType, body.fileName);
  const dayKey = formatDayKey();
  const safeMenuItemId = (body.menuItemId ?? "").trim();
  const basePrefix = safeMenuItemId
    ? `brands/${brandId}/stores/${storeId}/menu/${safeMenuItemId}`
    : `brands/${brandId}/stores/${storeId}/menu`;
  const objectKey = `${basePrefix}/${dayKey}/${Date.now()}-${randomUUID()}.${ext}`;

  try {
    const bucket = getR2BucketName();
    const client = getR2Client();
    const publicBaseUrl = getR2PublicBaseUrl();

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
    const publicUrl = `${publicBaseUrl}/${objectKey}`;

    return NextResponse.json({
      uploadUrl,
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      key: objectKey,
      publicUrl,
      expiresIn: 300,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
  }
}
