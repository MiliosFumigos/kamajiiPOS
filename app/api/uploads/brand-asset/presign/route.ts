import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getR2BucketName, getR2Client, getR2PublicBaseUrl } from "@/lib/r2";
import { Role } from "@/lib/types";
import { apiError } from "@/lib/api-error";

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/webp", "image/jpeg", "image/png", "image/svg+xml"]);

type AssetType = "logo" | "favicon";
type PresignBody = {
  fileName?: string;
  contentType?: string;
  fileSize?: number;
  assetType?: AssetType;
};

function guessExtension(contentType: string, fileName?: string): string {
  const lowerName = (fileName ?? "").toLowerCase();
  if (lowerName.endsWith(".svg")) return "svg";
  if (lowerName.endsWith(".webp")) return "webp";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "jpg";
  if (lowerName.endsWith(".png")) return "png";
  if (contentType === "image/svg+xml") return "svg";
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
    return apiError("UNAUTHORIZED", "Unauthorized", 401);
  }
  if (session.user.role !== Role.OWNER) {
    return apiError("FORBIDDEN", "Only owner can upload brand assets", 403);
  }
  if (!session.user.brandId) {
    return apiError("BRAND_NOT_FOUND", "Brand not found for user", 400);
  }

  let body: PresignBody = {};
  try {
    body = (await request.json()) as PresignBody;
  } catch {
    return apiError("INVALID_JSON", "Invalid JSON body", 400);
  }

  const contentType = (body.contentType ?? "").trim().toLowerCase();
  const fileSize = Number(body.fileSize ?? 0);
  const assetType = body.assetType;

  if (assetType !== "logo" && assetType !== "favicon") {
    return apiError("INVALID_ASSET_TYPE", "assetType must be logo or favicon", 400);
  }
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return apiError("INVALID_CONTENT_TYPE", "Only webp/jpeg/png/svg are allowed", 400);
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_IMAGE_SIZE_BYTES) {
    return apiError("INVALID_FILE_SIZE", "Image must be <= 2MB", 400);
  }

  const ext = guessExtension(contentType, body.fileName);
  const dayKey = formatDayKey();
  const objectKey = `brands/${session.user.brandId}/branding/${assetType}/${dayKey}/${Date.now()}-${randomUUID()}.${ext}`;

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
    return apiError("PRESIGN_FAILED", "Failed to create upload URL", 500);
  }
}
