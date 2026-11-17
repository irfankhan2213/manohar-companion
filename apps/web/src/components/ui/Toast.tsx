import React, { createContext, useContext, useCallback } from 'react';
import { Toaster, toast as sonnerToast } from 'sonner';

export interface ToastOptions {
  message: string;
  variant?: 'success' | 'danger' | 'neutral';
  undoAction?: () => void;
  duration?: number;
}

export interface ToastContextType {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const showToast = useCallback((options: ToastOptions) => {
    const duration = options.duration ?? 3500;
    const action = options.undoAction
      ? {
          label: 'Undo',
          onClick: options.undoAction,
        }
      : undefined;

    if (options.variant === 'danger') {
      sonnerToast.error(options.message, { action, duration });
    } else if (options.variant === 'success') {
      sonnerToast.success(options.message, { action, duration });
    } else {
      sonnerToast(options.message, { action, duration });
    }
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        offset="68px"
        toastOptions={{
          style: {
            borderRadius: '14px',
            fontFamily: 'inherit',
          },
        }}
      />
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

export { sonnerToast as toast };
