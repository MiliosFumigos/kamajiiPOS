"use client";

interface TopbarProps {
  title: string;
  brandName: string;
  brandLogoUrl: string;
  onMenuClick?: () => void;
}

export function Topbar({ title, brandName, brandLogoUrl, onMenuClick }: TopbarProps) {
  return (
    <header className="grid h-14 shrink-0 grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2 border-b border-slate-200 bg-white px-4 md:grid-cols-[1fr_auto_1fr] md:px-6">
      <div className="flex items-center">
        {onMenuClick && (
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
            onClick={onMenuClick}
            aria-label="開啟選單"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="justify-self-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={brandLogoUrl}
          alt={`${brandName} Logo`}
          className="h-14 w-auto object-contain"
        />
      </div>

      <div className="flex items-center justify-end">
        <span className="hidden text-sm font-medium text-slate-500 md:block">{title}</span>
      </div>
    </header>
  );
}
