import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  className?: string;
}

export function Badge({ children, color, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}
      style={color ? { backgroundColor: color + '22', color, border: `1px solid ${color}44` } : {}}
    >
      {children}
    </span>
  );
}
