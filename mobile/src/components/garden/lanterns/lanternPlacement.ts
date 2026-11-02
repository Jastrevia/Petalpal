import defaults from './placements.json';
import { isDryGardenGround } from '../fairy/gardenGround';
import { GARDEN_WORLD_BOUNDS } from '../rendering/gardenWorldBounds';

export type LanternPlacement = {
  id: string; kind: 'ground' | 'lotus'; x: number; y: number; scale: number; rotation: number;
};
export const INITIAL_LANTERNS = defaults as LanternPlacement[];
export const LANTERN_STORAGE_KEY = 'petalpal.dev.lantern-placements.v1';

/** The base/waterline is the anchor. Test the complete footprint, including rotation. */
export function validLanternPlacement(p: LanternPlacement): boolean {
  if (![p.x, p.y, p.scale, p.rotation].every(Number.isFinite) ||
      p.scale < 0.4 || p.scale > 2 || Math.abs(p.rotation) > 180) return false;
  const b = GARDEN_WORLD_BOUNDS;
  const angle = p.rotation * Math.PI / 180;
  const rx = (p.kind === 'ground' ? 20 : 36) * p.scale;
  const ry = (p.kind === 'ground' ? 9 : 14) * p.scale;
  // Interior samples prevent a base spanning a narrow channel or island edge.
  for (let u = -1; u <= 1; u += 0.5) for (let v = -1; v <= 1; v += 0.5) {
    const x = p.x + u * rx * Math.cos(angle) - v * ry * Math.sin(angle);
    const y = p.y + u * rx * Math.sin(angle) + v * ry * Math.cos(angle);
    if (x < b.x || y < b.y || x >= b.x + b.width || y >= b.y + b.height ||
        isDryGardenGround({ x, y }) !== (p.kind === 'ground')) return false;
  }
  return true;
}

/** Treat saved data as untrusted; preserve the exact fixed roster and reject partial saves. */
export function parseLanternPlacements(raw: string): LanternPlacement[] | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.length !== INITIAL_LANTERNS.length) return null;
    return INITIAL_LANTERNS.map(template => {
      const matches = data.filter(p => p && p.id === template.id && p.kind === template.kind);
      if (matches.length !== 1 || !validLanternPlacement(matches[0])) throw new Error('Invalid placement');
      const { x, y, scale, rotation } = matches[0];
      return { ...template, x, y, scale, rotation };
    });
  } catch { return null; }
}
