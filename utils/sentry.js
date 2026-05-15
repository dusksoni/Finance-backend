// Sentry error tracking — initialized before anything else in server.js
// Install: npm install @sentry/node
// Set SENTRY_DSN in .env to enable. If not set, Sentry is disabled (no-op).

let Sentry = null;

function init(app) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('ℹ️  Sentry disabled (SENTRY_DSN not set)');
    return;
  }

  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.APP_VERSION || '1.0.0',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
      integrations: [
        Sentry.httpIntegration(),
        Sentry.expressIntegration({ app }),
      ],
    });
    console.log('✅ Sentry initialized');
  } catch (e) {
    console.warn('⚠️  Sentry package not installed — run: npm install @sentry/node');
    Sentry = null;
  }
}

// Add after all routes, before global error handler
function errorHandler() {
  if (!Sentry) return (err, req, res, next) => next(err);
  return Sentry.expressErrorHandler();
}

function captureException(err, context = {}) {
  if (!Sentry) return;
  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
    Sentry.captureException(err);
  });
}

function setUser(req) {
  if (!Sentry || !req.user) return;
  Sentry.setUser({
    id: req.user.adminId || req.user.employeeId,
    type: req.user.type,
  });
}

module.exports = { init, errorHandler, captureException, setUser };
