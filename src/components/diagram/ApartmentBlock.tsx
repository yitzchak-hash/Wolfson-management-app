import React from 'react';
import { Apartment, Stage } from '../../types';

interface ApartmentBlockProps {
  apartment: Apartment;
  stage: Stage | null;
  onClick: () => void;
  isHighlighted: boolean;
  isDimmed: boolean;
  showShinuiBadge: boolean;
}

function getTextColor(bgHex: string): string {
  const hex = bgHex.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1a202c' : '#ffffff';
}

export function ApartmentBlock({
  apartment,
  stage,
  onClick,
  isHighlighted,
  isDimmed,
  showShinuiBadge,
}: ApartmentBlockProps) {
  const bgColor = stage ? stage.color : '#e5e7eb';
  const textColor = getTextColor(bgColor);
  const label = apartment.isUnnamed
    ? (apartment.displayName || '')
    : (apartment.displayName || apartment.apartmentNumber);

  let blockClass = 'apartment-block flex items-center justify-center relative rounded select-none';
  if (isHighlighted) blockClass += ' highlighted';
  if (isDimmed) blockClass += ' dimmed';

  return (
    <div
      className={blockClass}
      style={{
        backgroundColor: bgColor,
        color: textColor,
        minWidth: '72px',
        height: '44px',
        flexGrow: 1,
        border: `1px solid ${bgColor === '#e5e7eb' ? '#d1d5db' : bgColor}`,
      }}
      onClick={onClick}
      title={label ? `Apt ${label}` : 'Unnamed unit'}
    >
      <span className="text-xs font-semibold truncate px-1 text-center leading-tight">
        {label || <span className="opacity-40 italic text-[10px]">–</span>}
      </span>

      {showShinuiBadge && apartment.classification === 'shinui' && (
        <div
          className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#f59e0b', border: '1.5px solid white' }}
          title="Changes"
        >
          <span className="text-white font-bold leading-none" style={{ fontSize: '8px' }}>S</span>
        </div>
      )}
    </div>
  );
}
