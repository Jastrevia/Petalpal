import { Platform } from 'react-native';

// Phones (web): iOS Safari scrolls the whole page up to show a text field above the keyboard
// and often leaves it there after the keyboard closes, so the Garden's icons sit too high or
// under the browser bar until a refresh. The app never scrolls the page itself (ScrollViews
// scroll inside it), so whenever nothing is being typed the page goes back to the top.
export function keepWebPageInPlace() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reset = () => {
    const active = document.activeElement as HTMLElement | null;
    const typing = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    const scrolled = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
    if (!typing && scrolled) window.scrollTo(0, 0);
  };
  const soon = () => { if (timer) clearTimeout(timer); timer = setTimeout(reset, 150); };
  // Phones drop the Garden's GPU canvas (WebGL) when the browser is backgrounded or short on
  // memory; it then stays blank until a refresh. Reload once the page is visible again instead.
  // The app also releases canvases on purpose as screens close (gardenWebRenderer, Skia views):
  // those canvases leave the page, so only a canvas still on the page counts as lost.
  const lostCanvases = new Set<HTMLCanvasElement>();
  const reloadIfLost = () => {
    for (const canvas of lostCanvases) if (!canvas.isConnected) lostCanvases.delete(canvas);
    if (lostCanvases.size && document.visibilityState === 'visible') window.location.reload();
  };
  const onLost = (event: Event) => {
    if (!(event.target instanceof HTMLCanvasElement)) return;
    lostCanvases.add(event.target);
    setTimeout(reloadIfLost, 1500);
  };
  document.addEventListener('webglcontextlost', onLost, true);
  document.addEventListener('visibilitychange', reloadIfLost);
  window.addEventListener('focusout', soon);
  window.addEventListener('orientationchange', soon);
  window.visualViewport?.addEventListener('resize', soon);
  return () => {
    if (timer) clearTimeout(timer);
    document.removeEventListener('webglcontextlost', onLost, true);
    document.removeEventListener('visibilitychange', reloadIfLost);
    window.removeEventListener('focusout', soon);
    window.removeEventListener('orientationchange', soon);
    window.visualViewport?.removeEventListener('resize', soon);
  };
}
