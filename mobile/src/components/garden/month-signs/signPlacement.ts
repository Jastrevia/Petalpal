import approvedPlacements from './monthly-sign-placements.json';

export type SignPlacement = { month: number; x: number; y: number; scale: number };
export const SIGN_STORAGE_KEY = 'petalpal.month-sign-placements.v1';
export const SIGN_SIZE = 92;
// The pole meets the soil here in the supplied PNGs. Padding and the board are not ground collision.
export const SIGN_ANCHOR = { x: .55, y: .84 } as const;
export const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Validate serializable numeric data and fixed month identity only. Position and scale
// have no terrain, collision, boundary or range constraints.
export function validSignPlacement(p: SignPlacement): boolean {
  return Number.isInteger(p.month) && p.month >= 1 && p.month <= 12 &&
    [p.x,p.y,p.scale].every(Number.isFinite);
}

// Exact owner-approved browser export. Only an intentional source edit changes these defaults.
export const INITIAL_SIGNS: SignPlacement[] = approvedPlacements.map(p=>Object.freeze({...p}));
Object.freeze(INITIAL_SIGNS);
export function parseSignPlacements(raw: string): SignPlacement[] | null {
  try {
    const data: unknown=JSON.parse(raw);
    if(!Array.isArray(data)||data.length!==12) return null;
    return INITIAL_SIGNS.map(template=>{
      const items=data.filter(p=>p&&p.month===template.month);
      if(items.length!==1) throw new Error('Invalid sign roster');
      const {x,y,scale}=items[0];
      const placement={...template,x,y,scale};
      if (!validSignPlacement(placement)) throw new Error('Invalid transform');
      return placement;
    });
  } catch { return null; }
}
export const signPavilionHref = (month: number) => ({ pathname: '/reflection' as const, params: {month:String(month)} });
