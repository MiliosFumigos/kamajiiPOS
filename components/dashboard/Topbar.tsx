"use client";

interface TopbarProps {
  title: string;
  onMenuClick?: () => void;
}

export function Topbar({ title, onMenuClick }: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-6">
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
      <h1 className="min-w-0 truncate text-lg font-semibold text-slate-900">
        {title}
      </h1>
    </header>
  );
}
