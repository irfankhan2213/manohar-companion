import clsx from 'clsx';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      className={clsx(
        'w-full bg-fill p-1 rounded-xl flex items-center select-none',
        className
      )}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(opt.value)}
            className={clsx(
              'flex-1 py-1.5 px-3 rounded-lg text-subhead font-semibold transition-all duration-200 text-center truncate',
              isActive
                ? 'bg-surface text-label shadow-sm'
                : 'text-label-2 hover:text-label active:opacity-70'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
