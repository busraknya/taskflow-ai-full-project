'use client';

import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'error' | 'success';
  onClose: () => void;
}

export function Toast({ message, type = 'success', onClose }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  const bgStyle = type === 'error' 
    ? 'bg-red-900 border-red-700 text-white' 
    : 'bg-zinc-800 border-zinc-700 text-white';

  return (
    <div className="fixed top-6 right-6 z-[9999] transition-all duration-300">
      <div className={`px-4 py-3 rounded-lg border text-xs shadow-2xl flex items-center space-x-3 ${bgStyle}`}>
        <span>{message}</span>
        <button onClick={onClose} className="text-zinc-400 hover:text-white text-xs font-bold">✕</button>
      </div>
    </div>
  );
}