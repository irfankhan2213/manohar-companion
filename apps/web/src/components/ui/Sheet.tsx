import React from 'react';
import { Drawer } from 'vaul';
import clsx from 'clsx';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  snapPoints?: (number | string)[];
  activeSnapPoint?: number | string | null;
  setActiveSnapPoint?: (snapPoint: number | string | null) => void;
  className?: string;
}

export const Sheet: React.FC<SheetProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  snapPoints,
  activeSnapPoint,
  setActiveSnapPoint,
  className,
}) => {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={snapPoints}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={setActiveSnapPoint}
      shouldScaleBackground
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 transition-opacity backdrop-blur-[2px]" />
        <Drawer.Content
          className={clsx(
            'fixed bottom-0 inset-x-0 z-50 bg-surface rounded-t-ios-sheet outline-none flex flex-col max-h-[92vh] max-w-lg mx-auto shadow-2xl',
            className
          )}
        >
          {/* iOS Grabber */}
          <div className="w-full flex items-center justify-center pt-3 pb-2 shrink-0">
            <div className="w-9 h-1 rounded-full bg-separator" />
          </div>

          {/* Header */}
          {(title || description) && (
            <div className="px-5 pb-3 flex items-start justify-between shrink-0 border-b border-separator/40">
              <div className="flex flex-col">
                {title && (
                  <Drawer.Title className="text-title font-semibold text-label">
                    {title}
                  </Drawer.Title>
                )}
                {description && (
                  <Drawer.Description className="text-subhead text-label-2 mt-0.5">
                    {description}
                  </Drawer.Description>
                )}
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="w-8 h-8 rounded-full bg-fill/60 flex items-center justify-center text-label-2 hover:text-label active:scale-95 transition-all"
                aria-label="Close"
              >
                <X className="w-4 h-4 stroke-[2.2]" />
              </button>
            </div>
          )}

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 pb-safe">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};
