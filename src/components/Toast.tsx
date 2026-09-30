"use client";

import { useEffect } from "react";

interface ToastProps {
  message: string;
  type?: "success" | "error";
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type = "success", onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgColor = type === "success"
    ? "bg-teal-600"
    : "bg-red-600";

  const icon = type === "success" ? "✓" : "✕";

  return (
    <div className="fixed top-6 left-1/2 z-[9999] -translate-x-1/2 animate-[slideDown_0.3s_ease-out]">
      <div className={`flex items-center gap-3 rounded-xl ${bgColor} px-5 py-3 text-white shadow-lg`}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
          {icon}
        </span>
        <p className="text-sm font-medium">{message}</p>
        <button onClick={onClose} className="ml-2 text-white/70 hover:text-white">
          ✕
        </button>
      </div>
    </div>
  );
}
