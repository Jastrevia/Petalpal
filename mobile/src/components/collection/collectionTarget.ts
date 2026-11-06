import type { RefObject } from 'react';
import type { View } from 'react-native';

// Where the Garden dock's Collection icon sits on screen, so the day's keepsake can fly into it
// after its reveal (DailyCheckInIntro), and a way to make the icon answer when it lands.
let icon: RefObject<View | null> | null = null;
const landed = new Set<() => void>();

export function registerCollectionIcon(ref: RefObject<View | null>) {
  icon = ref;
  return () => { if (icon === ref) icon = null; };
}

export function measureCollectionIcon(): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const view = icon?.current;
  if (!view) return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      view.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
    } catch { resolve(null); }
  });
}

export function onKeepsakeLanded(listener: () => void) { landed.add(listener); return () => { landed.delete(listener); }; }
export const keepsakeLanded = () => landed.forEach(listener => listener());
