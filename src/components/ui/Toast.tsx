import React, { useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';
import { haptic } from '../../data/haptics';

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
}

export function Toast({ message, type = 'success', onClose }: ToastProps) {
  // Something failed or was refused: the phone gives a warning buzz (owner, 2026-11-08).
  useEffect(() => { if (type === 'error') haptic('warn'); }, [type, message]);
  useEffect(() => {
    // 1.8s, not 3. A toast is a receipt — you read it in the corner of your
    // eye and carry on — and three seconds of it sitting over the board was
    // long enough to be in the way of the next thing.
    const t = setTimeout(onClose, 1800);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="toast fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl text-sm font-medium text-white"
      style={{ backgroundColor: type === 'success' ? '#10b981' : '#ef4444' }}>
      {type === 'success' ? <CheckCircle size={18} /> : <XCircle size={18} />}
      {message}
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}
