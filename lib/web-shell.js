// Public application shell only; all data stays behind the API auth boundary.
const routes = new Set([
  '/', '/journal', '/garden-history', '/bookhouse', '/reflection', '/garden-test', '/mailbox',
  '/feature/daily', '/feature/friends', '/feature/visit', '/feature/fairy',
  '/feature/profile', '/feature/weekly', '/feature/monthly', '/feature/settings',
]);
export function isWebShellRequest(req) {
  if (!['GET', 'HEAD'].includes(req.method)) return false;
  const pathname = req.path?.replace(/\/$/, '') || '/';
  return routes.has(pathname) || /^\/visit\/[a-zA-Z0-9_-]+$/.test(pathname);
}
