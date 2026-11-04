import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

// Phones (web): an on-screen keyboard only covers the page. react-native-web reports the visual viewport (the part
// above the keyboard) as the window, and the Treehouse laid out to it shrank the open journal page as the keyboard
// opened (to half its width, so its words looked huge) and resized and moved it again each time the keyboard's
// suggestion or Chinese candidate bar came and went — while the owner was typing. The Treehouse lays out to the app's
// own height instead (#root: 100dvh follows the browser's bars, not the keyboard); the writing page keeps its writing
// area above the keyboard itself (useWebVisibleBottom).

const rootHeight = () => (document.getElementById('root') ?? document.documentElement).clientHeight;

/** The window the Treehouse lays out in: the app's own size, which an on-screen keyboard does not change. */
export function useLayoutWindow() {
  const win = useWindowDimensions();
  if (Platform.OS !== 'web' || typeof document === 'undefined') return win;
  const height = rootHeight();
  return height > 0 && Math.abs(height - win.height) > .5 ? { ...win, height } : win;
}

/** Web: where the visible page ends (above an on-screen keyboard, in page coordinates, following the browser's own
 *  scroll to the caret), or null while no keyboard is up. Native apps use the Keyboard events instead. */
export function useWebVisibleBottom() {
  const [bottom, setBottom] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const measure = () => {
      // A keyboard takes far more than the browser's bars; a pinch-zoomed page is not a keyboard.
      const up = rootHeight() - vv.height > 80 && vv.scale < 1.01;
      const next = up ? Math.round(window.scrollY + vv.offsetTop + vv.height) : null;
      setBottom(prev => prev === next ? prev : next);
    };
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    window.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
      window.removeEventListener('scroll', measure);
    };
  }, []);
  return bottom;
}
