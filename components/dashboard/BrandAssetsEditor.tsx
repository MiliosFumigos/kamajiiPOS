"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type AssetType = "logo" | "favicon";

type BrandAssetsResponse = {
  logoUrl: string | null;
  faviconUrl: string | null;
  resolvedLogoUrl: string;
  resolvedFaviconUrl: string;
};

type PresignResponse = {
  uploadUrl: string;
  method: "PUT";
  headers?: Record<string, string>;
  key: string;
  publicUrl: string;
  expiresIn: number;
};

type UploadState = {
  logo: "idle" | "uploading";
  favicon: "idle" | "uploading";
};

const MAX_IMAGE_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = [
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
] as const;
// Header 用寬式 Logo：3.33:1（約等於 10:3）
const LOGO_ASPECT = 10 / 3;
const FAVICON_ASPECT = 1;
const DEFAULT_CROP = { x: 0, y: 0 };
const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const BRAND_ASSETS_UPDATED_EVENT = "brand-assets-updated";

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function createImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("無法讀取圖片，請重新選擇檔案。"));
    image.src = src;
  });
}

async function getCroppedImageBlob(
  imageSrc: string,
  crop: Area,
  mimeType: (typeof ALLOWED_IMAGE_TYPES)[number]
): Promise<Blob> {
  const image = await createImageElement(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("目前瀏覽器不支援圖片裁切，請重新嘗試。");
  }

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const outputMimeType = mimeType === "image/svg+xml" ? "image/png" : mimeType;
  const blob = await new Promise<Blob | null>((resolve) => {
    const quality = outputMimeType === "image/png" ? undefined : 0.92;
    canvas.toBlob((file) => resolve(file), outputMimeType, quality);
  });
  if (!blob) {
    throw new Error("裁切後圖片產生失敗，請重新嘗試。");
  }
  return blob;
}

export function BrandAssetsEditor() {
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const faviconInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({
    logo: "idle",
    favicon: "idle",
  });

  const [assets, setAssets] = useState<BrandAssetsResponse | null>(null);

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropAssetType, setCropAssetType] = useState<AssetType>("logo");
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState("brand-asset");
  const [cropMimeType, setCropMimeType] = useState<
    (typeof ALLOWED_IMAGE_TYPES)[number]
  >("image/jpeg");
  const [cropPosition, setCropPosition] = useState(DEFAULT_CROP);
  const [cropZoom, setCropZoom] = useState(DEFAULT_ZOOM);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const isBusy = saving || uploadState.logo === "uploading" || uploadState.favicon === "uploading";

  const currentCropAspect = useMemo(
    () => (cropAssetType === "logo" ? LOGO_ASPECT : FAVICON_ASPECT),
    [cropAssetType]
  );

  const notifyBrandAssetsUpdated = (nextAssets: BrandAssetsResponse) => {
    window.dispatchEvent(
      new CustomEvent(BRAND_ASSETS_UPDATED_EVENT, {
        detail: {
          resolvedLogoUrl: nextAssets.resolvedLogoUrl,
          resolvedFaviconUrl: nextAssets.resolvedFaviconUrl,
        },
      })
    );
  };

  useEffect(() => {
    return () => {
      if (cropImageSrc?.startsWith("blob:")) {
        URL.revokeObjectURL(cropImageSrc);
      }
    };
  }, [cropImageSrc]);

  useEffect(() => {
    const loadAssets = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/brand/assets");
        const data = (await parseJsonSafe<BrandAssetsResponse | { error?: string }>(
          res
        )) ?? {};
        if (!res.ok || !("resolvedLogoUrl" in data)) {
          throw new Error(
            (data as { error?: string }).error ??
              `載入品牌資產失敗（HTTP ${res.status}）。`
          );
        }
        setAssets(data);
        notifyBrandAssetsUpdated(data);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "載入品牌資產失敗。");
      } finally {
        setLoading(false);
      }
    };

    void loadAssets();
  }, []);

  const openCropModalForFile = (assetType: AssetType, file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      setError("僅支援 WebP、JPEG、PNG、SVG 圖片格式。");
      return;
    }
    if (file.size > MAX_IMAGE_FILE_SIZE) {
      setError("圖片需小於或等於 2MB。");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    if (cropImageSrc?.startsWith("blob:")) {
      URL.revokeObjectURL(cropImageSrc);
    }
    setCropAssetType(assetType);
    setCropPosition(DEFAULT_CROP);
    setCropZoom(DEFAULT_ZOOM);
    setCroppedAreaPixels(null);
    setCropMimeType(file.type as (typeof ALLOWED_IMAGE_TYPES)[number]);
    setCropFileName(file.name || `${assetType}-asset`);
    setCropImageSrc(URL.createObjectURL(file));
    setCropModalOpen(true);
  };

  const closeCropModal = () => {
    setCropModalOpen(false);
    if (cropImageSrc?.startsWith("blob:")) {
      URL.revokeObjectURL(cropImageSrc);
    }
    setCropImageSrc(null);
    setCropPosition(DEFAULT_CROP);
    setCropZoom(DEFAULT_ZOOM);
    setCroppedAreaPixels(null);
  };

  const saveAssetUrl = async (assetType: AssetType, url: string) => {
    if (!assets) return;
    setSaving(true);
    try {
      const body =
        assetType === "logo"
          ? { logoUrl: url, faviconUrl: assets.faviconUrl ?? "" }
          : { logoUrl: assets.logoUrl ?? "", faviconUrl: url };
      const res = await fetch("/api/brand/assets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await parseJsonSafe<BrandAssetsResponse | { error?: string }>(
        res
      )) ?? {};
      if (!res.ok || !("resolvedLogoUrl" in data)) {
        throw new Error(
          (data as { error?: string }).error ?? `儲存品牌資產失敗（HTTP ${res.status}）。`
        );
      }
      setAssets(data);
      notifyBrandAssetsUpdated(data);
      setSuccessMessage(assetType === "logo" ? "Logo 已更新。" : "Favicon 已更新。");
      setError(null);
    } finally {
      setSaving(false);
    }
  };

  const uploadAssetFile = async (assetType: AssetType, file: File) => {
    setUploadState((prev) => ({ ...prev, [assetType]: "uploading" }));
    try {
      const presignRes = await fetch("/api/uploads/brand-asset/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
          assetType,
        }),
      });
      const presignData = (await parseJsonSafe<PresignResponse | { error?: string }>(
        presignRes
      )) ?? {};
      if (!presignRes.ok || !("uploadUrl" in presignData)) {
        throw new Error(
          (presignData as { error?: string }).error ??
            `無法取得上傳網址（HTTP ${presignRes.status}）。`
        );
      }

      const uploadRes = await fetch(presignData.uploadUrl, {
        method: presignData.method ?? "PUT",
        headers: {
          "Content-Type": file.type,
          ...(presignData.headers ?? {}),
        },
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error("上傳圖片失敗，請稍後再試。");
      }

      await saveAssetUrl(assetType, presignData.publicUrl);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "上傳失敗，請稍後重試。");
      setSuccessMessage(null);
    } finally {
      setUploadState((prev) => ({ ...prev, [assetType]: "idle" }));
    }
  };

  const confirmCropAndUpload = async () => {
    if (!cropImageSrc || !croppedAreaPixels) {
      setError("尚未完成裁切，請調整後再試一次。");
      return;
    }
    try {
      const outputBlob = await getCroppedImageBlob(cropImageSrc, croppedAreaPixels, cropMimeType);
      if (outputBlob.size > MAX_IMAGE_FILE_SIZE) {
        throw new Error("裁切後圖片仍超過 2MB，請縮小裁切範圍後再試。");
      }
      const extension =
        cropMimeType === "image/png" || cropMimeType === "image/svg+xml"
          ? "png"
          : cropMimeType === "image/webp"
            ? "webp"
            : "jpg";
      const safeName = cropFileName.replace(/\.[^.]+$/, "");
      const outputType =
        cropMimeType === "image/svg+xml" ? "image/png" : cropMimeType;
      const croppedFile = new File(
        [outputBlob],
        `${safeName}-${cropAssetType}-cropped.${extension}`,
        { type: outputType }
      );
      closeCropModal();
      await uploadAssetFile(cropAssetType, croppedFile);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "裁切或上傳失敗，請重新嘗試。");
      setSuccessMessage(null);
    }
  };

  const handleResetToDefault = async (assetType: AssetType) => {
    if (!assets) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const body =
        assetType === "logo"
          ? { logoUrl: "", faviconUrl: assets.faviconUrl ?? "" }
          : { logoUrl: assets.logoUrl ?? "", faviconUrl: "" };
      const res = await fetch("/api/brand/assets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await parseJsonSafe<BrandAssetsResponse | { error?: string }>(
        res
      )) ?? {};
      if (!res.ok || !("resolvedLogoUrl" in data)) {
        throw new Error(
          (data as { error?: string }).error ?? `重設預設圖片失敗（HTTP ${res.status}）。`
        );
      }
      setAssets(data);
      notifyBrandAssetsUpdated(data);
      setSuccessMessage(assetType === "logo" ? "Logo 已改回預設圖。" : "Favicon 已改回預設圖。");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "重設失敗，請稍後重試。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="品牌網站 Logo / Favicon">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          這裡可設定品牌網站顯示用 Logo 與 Favicon。Logo 比例固定 3.33:1、Favicon 比例固定 1:1。
        </p>

        {loading ? (
          <p className="text-sm text-slate-500">載入品牌資產中...</p>
        ) : !assets ? (
          <p className="text-sm text-red-600">{error ?? "無法讀取品牌資產。"}</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-900">Logo（3.33:1）</p>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/webp,image/jpeg,image/png,image/svg+xml"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  openCropModalForFile("logo", file);
                  e.currentTarget.value = "";
                }}
                disabled={isBusy}
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={isBusy}
                className="group block w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left transition hover:border-brand-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="relative flex h-44 w-full items-center justify-center bg-slate-100 sm:h-52">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assets.resolvedLogoUrl}
                    alt="品牌 Logo 預覽"
                    className="max-h-full max-w-full object-contain p-2 transition duration-200 group-hover:scale-[1.01]"
                  />
                  {uploadState.logo === "uploading" && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/35">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                    </div>
                  )}
                </div>
              </button>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isBusy}
                >
                  上傳 Logo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handleResetToDefault("logo")}
                  disabled={isBusy}
                >
                  改回預設
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-900">Favicon（1:1）</p>
              <input
                ref={faviconInputRef}
                type="file"
                accept="image/webp,image/jpeg,image/png,image/svg+xml"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  openCropModalForFile("favicon", file);
                  e.currentTarget.value = "";
                }}
                disabled={isBusy}
              />
              <button
                type="button"
                onClick={() => faviconInputRef.current?.click()}
                disabled={isBusy}
                className="group block w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left transition hover:border-brand-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="relative flex h-44 w-full items-center justify-center bg-slate-100 sm:h-52">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assets.resolvedFaviconUrl}
                    alt="品牌 Favicon 預覽"
                    className="max-h-full max-w-full object-contain p-2 transition duration-200 group-hover:scale-[1.01]"
                  />
                  {uploadState.favicon === "uploading" && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/35">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                    </div>
                  )}
                </div>
              </button>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => faviconInputRef.current?.click()}
                  disabled={isBusy}
                >
                  上傳 Favicon
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handleResetToDefault("favicon")}
                  disabled={isBusy}
                >
                  改回預設
                </Button>
              </div>
            </div>
          </div>
        )}

        {successMessage && <p className="text-xs text-green-700">{successMessage}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {cropModalOpen && cropImageSrc && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 p-4">
          <div className="flex min-h-full items-center justify-center">
            <div className="flex w-full max-w-3xl max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-xl bg-white shadow-xl">
              <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
                <h3 className="text-sm font-semibold text-slate-900">
                  裁切{cropAssetType === "logo" ? " Logo" : " Favicon"}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {cropAssetType === "logo"
                    ? "請拖曳與縮放，決定 3.33:1 顯示區域後再上傳。"
                    : "請拖曳與縮放，決定 1:1 顯示區域後再上傳。"}
                </p>
              </div>
              <div className="overflow-y-auto p-4 sm:p-5">
                <div className="relative h-[42dvh] min-h-[220px] w-full overflow-hidden rounded-lg bg-slate-100 sm:h-[50dvh] sm:max-h-[420px]">
                  <Cropper
                    image={cropImageSrc}
                    crop={cropPosition}
                    zoom={cropZoom}
                    aspect={currentCropAspect}
                    minZoom={MIN_ZOOM}
                    maxZoom={MAX_ZOOM}
                    restrictPosition={false}
                    objectFit="contain"
                    onCropChange={setCropPosition}
                    onZoomChange={setCropZoom}
                    onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                    cropShape="rect"
                    showGrid
                  />
                </div>
                <div className="mt-4 space-y-2">
                  <label className="block text-xs font-medium text-slate-700">縮放</label>
                  <input
                    type="range"
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={cropZoom}
                    onChange={(e) => setCropZoom(Number(e.target.value))}
                    className="w-full accent-brand-600"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
                <Button type="button" variant="outline" onClick={closeCropModal} disabled={isBusy}>
                  取消
                </Button>
                <Button type="button" onClick={() => void confirmCropAndUpload()} disabled={isBusy}>
                  套用裁切並上傳
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
