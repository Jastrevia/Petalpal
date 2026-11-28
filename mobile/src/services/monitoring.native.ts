import * as Sentry from '@sentry/react-native';
import * as Application from 'expo-application';
import { runningUpdate } from './otaUpdates';
import { scrubUrl } from './monitoringScrub';

// Crash and error reports from store builds (Sentry), so a crash on someone's phone reaches the founders
// within minutes instead of a one-star review. Off unless EXPO_PUBLIC_SENTRY_DSN is set (EAS production
// environment), and never in development. What PetalPal people write never leaves in a report: no user
// identity, no screenshots or view trees, no console lines, no request or response bodies, and ids in
// addresses are replaced. A report says what broke, where, on which build and which hotfix.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const monitoringEnabled = Boolean(dsn) && !__DEV__;

export function startMonitoring() {
  if (!monitoringEnabled) return;
  const update = runningUpdate();
  Sentry.init({
    dsn,
    environment: update.channel ?? 'production',
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableAutoSessionTracking: true, // crash-free sessions, the launch health number
    tracesSampleRate: 0,
    maxBreadcrumbs: 40,
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console' || breadcrumb.category === 'ui.input') return null;
      if (breadcrumb.data && typeof breadcrumb.data.url === 'string') {
        breadcrumb.data = { method: breadcrumb.data.method, status_code: breadcrumb.data.status_code, url: scrubUrl(breadcrumb.data.url) };
      }
      if (breadcrumb.category === 'navigation' && breadcrumb.data) {
        breadcrumb.data = { from: scrubUrl(String(breadcrumb.data.from ?? '')), to: scrubUrl(String(breadcrumb.data.to ?? '')) };
      }
      return breadcrumb;
    },
    beforeSend(event) {
      delete event.user;
      delete event.request;
      delete event.extra;
      return event;
    },
  });
  Sentry.setTag('app_version', `${Application.nativeApplicationVersion ?? '?'} (${Application.nativeBuildVersion ?? '?'})`);
  Sentry.setTag('update', update.embedded ? 'store-build' : update.updateId ?? 'unknown');
}

/** An error the app caught and survived, worth knowing about (for example a failed save). */
export function reportError(error: unknown, where: string) {
  if (!monitoringEnabled) return;
  Sentry.withScope(scope => { scope.setTag('where', where); Sentry.captureException(error); });
}
