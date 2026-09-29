'use client';

import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'error' | 'success';
  onClose: () => void;
}

export function Toast({ message, type = 'success', onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000); // 4 saniye sonra otomatik kaybolur
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  const bgStyle = type === 'error' 
    ? 'bg-red-950/90 border-red-900 text-red-300' 
    : 'bg-zinc-900/90 border-zinc-800 text-zinc-100';

  return (
    <div className="fixed top-6 right-6 z-50 animate-fade-in">
      <div className={`px-4 py-3 rounded-lg border text-xs shadow-2xl backdrop-blur-md flex items-center space-x-3 ${bgStyle}`}>
        <span>{message}</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-white text-xs">✕</button>
      </div>
    </div>
  );
}