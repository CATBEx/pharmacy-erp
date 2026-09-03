// Small stroke-based icon set (bug #16) -- replaces plain text glyphs (☰, ✕) app-wide.
// Every icon defaults to currentColor so it follows whatever text color its container sets,
// which means it automatically follows the light/dark theme without any extra wiring.
import type { CSSProperties } from 'react';

interface IconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function IconMenu({ size = 20, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} style={style}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="14" y2="17" />
    </svg>
  );
}

export function IconClose({ size = 20, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} style={style}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function IconSearch({ size = 18, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} style={style}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function IconTrash({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} style={style}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function IconCheck({ size = 18, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} style={style}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconSun({ size = 18, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} style={style}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22" />
      <line x1="4.2" y1="4.2" x2="6" y2="6" />
      <line x1="18" y1="18" x2="19.8" y2="19.8" />
      <line x1="2" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22" y2="12" />
      <line x1="4.2" y1="19.8" x2="6" y2="18" />
      <line x1="18" y1="6" x2="19.8" y2="4.2" />
    </svg>
  );
}

export function IconMoon({ size = 18, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} style={style}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  );
}

export function IconPlus({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} style={style}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function IconMinus({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...base(size)} stroke={color} style={style}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
