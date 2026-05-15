// Prometheus metrics middleware — exposes /metrics endpoint
// Uses prom-client (add to package.json: npm install prom-client)

let register, httpRequestsTotal, httpRequestDurationMs, financePaymentsTotal,
  financePaymentsFailedTotal, financeCibilEnquiriesTotal;

function initMetrics() {
  const client = require('prom-client');
  const { Registry, collectDefaultMetrics, Counter, Histogram } = client;

  register = new Registry();
  register.setDefaultLabels({ app: 'finance-saas', env: process.env.NODE_ENV || 'development' });
  collectDefaultMetrics({ register });

  httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  });

  httpRequestDurationMs = new Histogram({
    name: 'http_request_duration_ms',
    help: 'Duration of HTTP requests in milliseconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
    registers: [register],
  });

  financePaymentsTotal = new Counter({
    name: 'finance_payments_total',
    help: 'Total payment transactions processed',
    labelNames: ['gateway', 'type', 'status'],
    registers: [register],
  });

  financePaymentsFailedTotal = new Counter({
    name: 'finance_payments_failed_total',
    help: 'Total failed payment transactions',
    labelNames: ['gateway', 'type'],
    registers: [register],
  });

  financeCibilEnquiriesTotal = new Counter({
    name: 'finance_cibil_enquiries_total',
    help: 'Total CIBIL/credit bureau enquiries',
    labelNames: ['provider', 'status'],
    registers: [register],
  });
}

// Normalize route path to avoid high-cardinality (e.g. /api/loan/abc123 → /api/loan/:id)
function normalizeRoute(req) {
  if (req.route?.path) {
    const base = req.baseUrl || '';
    return base + req.route.path;
  }
  // Collapse UUID/ObjectId segments
  return req.path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}

// Express middleware — attach timing, record on finish
function metricsMiddleware(req, res, next) {
  if (!register) return next(); // metrics not initialized
  const start = Date.now();

  res.on('finish', () => {
    const route = normalizeRoute(req);
    const labels = { method: req.method, route, status_code: res.statusCode };
    httpRequestsTotal.inc(labels);
    httpRequestDurationMs.observe(labels, Date.now() - start);
  });

  next();
}

// Express route handler — GET /metrics
async function metricsHandler(req, res) {
  if (!register) {
    return res.status(503).send('# Metrics not initialized\n');
  }
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
}

// Business event counters — call these from controllers
function recordPayment({ gateway = 'unknown', type = 'emi', status = 'success' } = {}) {
  if (!financePaymentsTotal) return;
  financePaymentsTotal.inc({ gateway, type, status });
  if (status === 'failed') financePaymentsFailedTotal.inc({ gateway, type });
}

function recordCibilEnquiry({ provider = 'unknown', status = 'success' } = {}) {
  if (!financeCibilEnquiriesTotal) return;
  financeCibilEnquiriesTotal.inc({ provider, status });
}

module.exports = { initMetrics, metricsMiddleware, metricsHandler, recordPayment, recordCibilEnquiry };
