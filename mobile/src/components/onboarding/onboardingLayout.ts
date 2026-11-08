// Pure geometry for the tour: where the guide sits beside a highlight, and how the Garden
// camera frames a world rectangle. Camera contract (GardenScene): screen = base + camera + world * fit * zoom.
export type Box = { x: number; y: number; width: number; height: number };
export type Insets = { top: number; bottom: number; left: number; right: number };
export type CameraFrame = { x: number; y: number; zoom: number };

export const GUIDE_FAIRY = { width: 70, height: 94 } as const;
const GAP = 14;

/** Top-left corner of the guide block (fairy + bubble) next to the target, never covering it. */
export function guidePlacement(target: Box | null, screen: { width: number; height: number },
  block: { width: number; height: number }, insets: Insets, prefer: 'auto' | 'below' | 'above' = 'auto') {
  const minX = insets.left + 12, maxX = screen.width - insets.right - 12 - block.width;
  const minY = insets.top + 10, maxY = screen.height - insets.bottom - 10 - block.height;
  const clampX = (x: number) => Math.max(minX, Math.min(Math.max(minX, maxX), x));
  const clampY = (y: number) => Math.max(minY, Math.min(Math.max(minY, maxY), y));
  if (!target) return { x: clampX((screen.width - block.width) / 2), y: clampY(screen.height * .58 - block.height / 2), side: 'free' as const };
  const centredX = clampX(target.x + target.width / 2 - block.width / 2);
  const below = target.y + target.height + GAP;
  const above = target.y - GAP - block.height;
  const fitsBelow = below + block.height <= screen.height - insets.bottom - 10;
  const fitsAbove = above >= insets.top + 10;
  const order: ('below' | 'above')[] = prefer === 'above' ? ['above', 'below'] : prefer === 'below' ? ['below', 'above']
    // Targets in the lower half (the navigation bar, zoom buttons) get the guide above them.
    : target.y + target.height / 2 > screen.height / 2 ? ['above', 'below'] : ['below', 'above'];
  for (const side of order) {
    if (side === 'below' && fitsBelow) return { x: centredX, y: below, side };
    if (side === 'above' && fitsAbove) return { x: centredX, y: above, side };
  }
  // A tall target: sit beside it, or over its least important edge as a last resort.
  const right = target.x + target.width + GAP;
  if (right + block.width <= screen.width - insets.right - 12) return { x: right, y: clampY(target.y), side: 'right' as const };
  const left = target.x - GAP - block.width;
  if (left >= insets.left + 12) return { x: left, y: clampY(target.y), side: 'left' as const };
  // No room anywhere (a short landscape phone): use the larger free edge so the overlap is smallest.
  const roomAbove = target.y - insets.top, roomBelow = screen.height - insets.bottom - target.y - target.height;
  return roomAbove > roomBelow ? { x: centredX, y: minY, side: 'above' as const } : { x: centredX, y: Math.max(minY, maxY), side: 'below' as const };
}

/** Screen rectangle of a world rectangle under the current camera. */
export function worldBoxToScreen(box: Box, camera: CameraFrame, fit: number, baseX: number, baseY: number): Box {
  const scale = fit * camera.zoom;
  return { x: baseX + camera.x + box.x * scale, y: baseY + camera.y + box.y * scale,
    width: box.width * scale, height: box.height * scale };
}

/** Camera that centres a world rectangle in the visible area and fills it where the zoom limits allow. */
export function frameWorldBox(box: Box, viewport: { width: number; height: number }, fit: number,
  baseX: number, baseY: number, insets: Insets, limits: { min: number; max: number }, fill = .86): CameraFrame {
  const width = Math.max(1, viewport.width - insets.left - insets.right);
  const height = Math.max(1, viewport.height - insets.top - insets.bottom);
  const wanted = Math.min(width * fill / (box.width * fit), height * fill / (box.height * fit));
  const zoom = Math.max(limits.min, Math.min(limits.max, wanted));
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  return { zoom, x: insets.left + width / 2 - baseX - cx * fit * zoom, y: insets.top + height / 2 - baseY - cy * fit * zoom };
}

/** Bounding box of points (for example the twelve month centroids), grown by a margin. */
export function boundsOf(points: { x: number; y: number }[], margin = 0): Box {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = Math.min(...xs) - margin, y = Math.min(...ys) - margin;
  return { x, y, width: Math.max(...xs) + margin - x, height: Math.max(...ys) + margin - y };
}
