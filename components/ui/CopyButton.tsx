"use client";

import { useState } from "react";

export function CopyButton({
  text,
  className = "",
  successText = "已複製",
}: {
  text: string;
  className?: string;
  successText?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  const onCopy = async () => {
    try {
      // Clipboard API 在非安全連線（http）或某些瀏覽器情況下可能失敗
      // 所以這裡先走 API，失敗後改用傳統 textarea 備援。
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        (window as any).isSecureContext
      ) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!ok) throw new Error("execCommand copy failed");
      }
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1500);
    } catch (e) {
      console.error("CopyButton error:", e);
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className={`rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 ${className}`}
      disabled={!text}
    >
      {status === "copied" ? successText : status === "error" ? "複製失敗" : "複製"}
    </button>
  );
}

