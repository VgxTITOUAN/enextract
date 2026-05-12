'use client';

import { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastData {
  msg: string;
  type: ToastType;
}

interface Props {
  toast: ToastData | null;
  onClose: () => void;
}

const styles: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: '#4a7c00', icon: '✓' },
  error:   { bg: '#e03131', icon: '✕' },
  info:    { bg: '#1971c2', icon: 'ℹ' },
  warning: { bg: '#f59f00', icon: '⚠' },
};

export default function Toast({ toast, onClose }: Props) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const s = styles[toast.type];

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm font-medium shadow-lg max-w-sm"
      style={{ backgroundColor: s.bg, animation: 'slideUp 0.2s ease' }}
    >
      <span className="text-base">{s.icon}</span>
      <span className="flex-1">{toast.msg}</span>
      <button
        onClick={onClose}
        className="text-white/70 hover:text-white text-lg leading-none ml-2"
      >
        ×
      </button>
    </div>
  );
}