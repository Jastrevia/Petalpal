import { GARDEN_FEATURES } from './featureCatalog';

// Real product aliases are explicit; new routes require a production decision.
const PRODUCTION_ROUTES = new Set([
  '/', '/journal', '/garden-history', '/bookhouse', '/reflection', '/garden-test', '/mailbox',
  ...GARDEN_FEATURES.map(feature => feature.route),
]);
export function routeAllowed(pathname: string, development: boolean): boolean {
  if (development) return true;
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return PRODUCTION_ROUTES.has(path) || /^\/visit\/[^/]+$/.test(path);
}
