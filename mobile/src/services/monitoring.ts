// The web app has no crash reporter yet (monitoring.native.ts is the phone's); these keep the same calls.
export const monitoringEnabled = false;
export function startMonitoring() {}
export function reportError(_error: unknown, _where: string) {}
