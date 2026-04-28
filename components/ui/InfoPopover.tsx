"use client";

import { useState } from "react";

type InfoPopoverProps = {
  title: string;
  lines: string[];
  className?: string;
};

export function InfoPopover({ title, lines, className = "" }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`relative inline-flex items-center group ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${title} 定義說明`}
        aria-expanded={open}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold text-slate-500 transition hover:border-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      <div
        className={[
          "pointer-events-none absolute right-0 top-6 z-30 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg transition",
          "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          open ? "opacity-100" : "",
        ].join(" ")}
      >
        <span
          aria-hidden
          className="absolute -top-1.5 right-1.5 h-3 w-3 rotate-45 border-l border-t border-slate-200 bg-white"
        />
        <p className="font-semibold text-slate-800">{title}</p>
        <div className="mt-1 space-y-1 break-words">
          {lines.map((line, idx) => (
            <p key={`${title}-${idx}`}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
