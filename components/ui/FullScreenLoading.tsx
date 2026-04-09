"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Ring } from "@uiball/loaders";

export type FullScreenLoadingProps = {
  open: boolean;
  title: string;
  description?: string;
};

/**
 * 全螢幕 loading：使用 portal 掛到 document.body，蓋住側欄與內容。
 * 顯示時間由呼叫端依各 API 的 loading 狀態決定。
 */
export function FullScreenLoading({
  open,
  title,
  description,
}: FullScreenLoadingProps) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:p-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[3px] motion-reduce:backdrop-blur-none"
        aria-hidden
      />

      <div className="relative w-full max-w-[min(100%,22rem)] rounded-2xl border border-slate-200/80 bg-white/95 px-6 py-8 shadow-2xl shadow-slate-900/15 sm:max-w-md sm:px-10 sm:py-11">
        <div className="flex flex-col items-center">
          <div aria-hidden>
            <Ring size={52} lineWeight={4} speed={1.75} color="#16a34a" />
          </div>
          <h2
            id={titleId}
            className="mt-6 text-center text-base font-semibold leading-snug text-slate-900 sm:text-lg"
          >
            {title}
          </h2>
          {description ? (
            <p
              id={descId}
              className="mt-2 max-w-[28ch] text-center text-sm leading-relaxed text-slate-600 sm:max-w-none"
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
