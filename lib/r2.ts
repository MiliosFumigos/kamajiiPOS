import { S3Client } from "@aws-sdk/client-s3";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function getR2BucketName(): string {
  return required("R2_BUCKET_NAME");
}

export function getR2PublicBaseUrl(): string {
  return required("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
}

export function getR2Client(): S3Client {
  return new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
}
