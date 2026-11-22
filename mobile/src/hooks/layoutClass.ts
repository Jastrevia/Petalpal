// Window size classes shared by every screen, in points (iOS) / CSS pixels (web).
// compact < 600 (phones, iPad split 1/3), medium 600–1024 (iPad portrait, small windows),
// expanded > 1024 (iPad landscape, desktop). Pure so node --test can check it without React Native.
export type SizeClass = 'compact' | 'medium' | 'expanded';
export type Orientation = 'portrait' | 'landscape';

export type Insets = { top: number; right: number; bottom: number; left: number };

export type LayoutClass = {
  sizeClass: SizeClass;
  orientation: Orientation;
  width: number;
  height: number;
  /** Window size minus the safe-area insets (notch, home indicator, status bar). */
  usableWidth: number;
  usableHeight: number;
  compact: boolean;
  medium: boolean;
  expanded: boolean;
};

export const COMPACT_MAX = 600;
export const MEDIUM_MAX = 1024;

export function sizeClassFor(width: number): SizeClass {
  if (width < COMPACT_MAX) return 'compact';
  return width <= MEDIUM_MAX ? 'medium' : 'expanded';
}

export function layoutClassFor(width: number, height: number, insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }): LayoutClass {
  const sizeClass = sizeClassFor(width);
  return {
    sizeClass,
    orientation: width > height ? 'landscape' : 'portrait',
    width,
    height,
    usableWidth: Math.max(0, width - insets.left - insets.right),
    usableHeight: Math.max(0, height - insets.top - insets.bottom),
    compact: sizeClass === 'compact',
    medium: sizeClass === 'medium',
    expanded: sizeClass === 'expanded',
  };
}
