import React from 'react';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

const POS: Record<string, string> = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left:   'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right:  'left-full top-1/2 -translate-y-1/2 ml-1.5',
};

export function Tooltip({ text, children, side = 'top' }: TooltipProps) {
  if (!text) return <>{children}</>;
  return (
    <span className="relative inline-flex group/tip">
      {children}
      <span
        role="tooltip"
        className={`${POS[side]} pointer-events-none absolute z-[200] opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150`}
      >
        <span className="block bg-gray-900 text-white text-[11px] font-medium rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap leading-tight">
          {text}
        </span>
      </span>
    </span>
  );
}
