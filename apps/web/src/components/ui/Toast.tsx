import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface ToastOptions {
  message: string;
  variant?: 'success' | 'danger' | 'neutral';
  undoAction?: () => void;
  duration?: number;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);

  const showToast = useCallback((options: ToastOptions) => {
    const id = Date.now();
    setToast({ ...options, id });

    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, options.duration ?? 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-8 inset-x-4 z-50 flex justify-center pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="bg-label text-surface rounded-2xl px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.18)] flex items-center justify-between gap-3 max-w-md w-full pointer-events-auto border border-separator/20">
            <div className="flex items-center gap-2.5 min-w-0">
              {toast.variant === 'danger' ? (
                <AlertCircle className="w-5 h-5 text-danger shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-ok shrink-0" />
              )}
              <span className="text-subhead font-medium text-surface truncate">
                {toast.message}
              </span>
            </div>

            {toast.undoAction && (
              <button
                type="button"
                onClick={() => {
                  toast.undoAction?.();
                  setToast(null);
                }}
                className="text-subhead font-semibold text-accent-soft hover:underline shrink-0"
              >
                Undo
              </button>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    return { showToast: () => {} };
  }
  return context;
}
