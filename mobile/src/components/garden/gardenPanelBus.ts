// Opens one of the Garden's panels (the HUD's features, e.g. 'events') from the Garden itself:
// tapping a lawn that has flowers opens Events.
const openers = new Set<(feature: string) => void>();
export function openGardenPanel(feature: string) { openers.forEach(open => open(feature)); }
export function onOpenGardenPanel(open: (feature: string) => void) { openers.add(open); return () => { openers.delete(open); }; }
