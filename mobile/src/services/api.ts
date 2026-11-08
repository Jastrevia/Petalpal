import { assertNativeSecurityClient } from './nativeSecurity';
export interface ApiConnection {
  apiBaseUrl: string;
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>;
  onUnauthorized?: () => void;
}
let connection: ApiConnection | null = null;
export function configureApi(next: ApiConnection | null) {
  if (next) assertNativeSecurityClient(next.apiBaseUrl);
  connection = next;
}
export function apiBaseUrl() {
  assertNativeSecurityClient(connection?.apiBaseUrl || process.env.EXPO_PUBLIC_API_BASE_URL);
  if (connection) return connection.apiBaseUrl.replace(/\/$/, '');
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configured) {
    // Native development devices reach the Mac through the Expo LAN host.
    // Web, simulators using localhost, and production keep their configured URL.
    if (__DEV__ && require('react-native').Platform.OS !== 'web') {
      const host = require('expo-constants').default.expoConfig?.hostUri?.split(':')[0];
      if (host) {
        try {
          const url = new URL(configured);
          if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
            url.hostname = host;
            return url.toString().replace(/\/$/, '');
          }
        } catch { /* Preserve existing handling of an invalid configured URL. */ }
      }
    }
    return configured.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && __DEV__) return `${window.location.protocol}//${window.location.hostname}:3000`;
  return '';
}
export async function accessToken(forceRefresh = false) {
  return connection ? connection.getAccessToken(forceRefresh) : null;
}
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
function invalidateUnauthorized(current: ApiConnection | null): never {
  if (current && connection === current) {
    // Invalidate once, before notifying the provider. Concurrent requests cannot
    // restore this connection or invalidate a subsequently signed-in account.
    configureApi(null);
    current.onUnauthorized?.();
  }
  throw new ApiError('Your session expired. Please sign in again.', 401);
}
function invalidCredential(error: unknown) {
  const code = (error as { code?: string })?.code;
  return ['auth/user-disabled', 'auth/user-not-found', 'auth/user-token-expired',
    'auth/invalid-user-token'].includes(code || '');
}
// DEV-only local previews (/onboarding-preview): requests are answered on the device by
// an in-memory adapter and never reach Render, Firebase or any database.
type PreviewTransport = (path: string, method: string, body?: object) => Promise<unknown>;
let previewTransport: PreviewTransport | null = null;
export function setPreviewApiTransport(next: PreviewTransport | null) {
  if (__DEV__) previewTransport = next;
}
export async function apiRequest<T>(path: string, method = 'GET', body?: object,
  options: { headers?: Record<string, string>; signal?: AbortSignal } = {}): Promise<T> {
  if (__DEV__ && previewTransport) return previewTransport(path, method, body) as Promise<T>;
  const current = connection;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (connection !== current) throw new ApiError('Your session changed. Please try again.', 401);
    let token: string | null;
    try { token = current ? await current.getAccessToken(attempt === 1) : null; }
    catch (error) {
      if (connection !== current) throw new ApiError('Your session changed. Please try again.', 401);
      if (!invalidCredential(error)) throw error; // Network errors are retryable, not logout signals.
      if (attempt === 0) continue;
      return invalidateUnauthorized(current);
    }
    if (connection !== current) throw new ApiError('Your session changed. Please try again.', 401);
    if (!token) {
      if (current) return invalidateUnauthorized(current);
      throw new ApiError('Sign in to PetalPal to continue.', 401);
    }
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method, signal: options.signal,
      headers: { ...options.headers, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (connection !== current) throw new ApiError('Your session changed. Please try again.', 401);
    if (response.status === 401 && attempt === 0) continue;
    if (response.status === 401) return invalidateUnauthorized(current);
    const data = await response.json().catch(() => null);
    if (connection !== current) throw new ApiError('Your session changed. Please try again.', 401);
    if (!response.ok) throw new ApiError(data?.error || `Request failed (${response.status}).`, response.status, data?.code);
    if (!data) throw new ApiError('The backend did not return JSON data.', response.status);
    return data as T;
  }
  throw new ApiError('Your session expired. Please sign in again.', 401);
}
