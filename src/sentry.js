import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!dsn) {
    console.warn("VITE_SENTRY_DSN não configurado — monitoramento de erros desativado.");
    return;
  }
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || "production",
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.2,
  });
}

export function setSentryUser(user) {
  if (!dsn) return;
  Sentry.setUser(user);
}

export function reportError(error, context) {
  if (!dsn) {
    console.error(error, context);
    return;
  }
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export const SentryErrorBoundary = dsn ? Sentry.ErrorBoundary : ({ children }) => children;
